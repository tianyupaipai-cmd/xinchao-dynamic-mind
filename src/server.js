import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { loadConfig, validateConfig } from './config.js';
import { applyDriveFeedback, applyOmbreHeartbeat, barkAllowed, breathDreamContext, contactIdleAllowed, daytimeEmergenceAllowed, dreamAllowed, newState, pickIntent, proactiveBarkAllowed, recordBark, recordDaytimeEmergence, recordDream, scheduleDaytimeEmergence, settleAndApplyConversationEvent, settleState, topDrives } from './engine.js';
import { selectUniqueBark } from './bark-dedupe.js';
import { StateStore } from './state-store.js';
import { ModelClient } from './model-client.js';
import { OmbreClient } from './ombre-client.js';
import { BarkClient } from './bark-client.js';
import { readOmbreHeartbeat } from './heartbeat-store.js';
import { buildContextEnvelope, contextDeliveryState, recordContextDelivery } from './context-envelope.js';
import { TransitionJournal } from './transition-journal.js';
import { handleMcpMessage } from './mcp-protocol.js';
import { OAuthProvider } from './oauth-provider.js';
import { recordHandoffNote } from './handoff-notes.js';
import { DashboardAuth } from './dashboard-auth.js';
import { buildConnectionManifest, buildDashboardSnapshot } from './dashboard-projection.js';

const config = validateConfig(loadConfig());
if (!config.serviceToken) throw new Error('SERVICE_TOKEN is required');

const store = new StateStore(config.statePath, () => newState());
const model = new ModelClient(config.model);
const ombre = new OmbreClient(config.ombre);
const bark = new BarkClient(config.bark);
const journal = new TransitionJournal(config.journalPath);
const oauth = new OAuthProvider(config.oauth, (event, fields = {}) => log(event, fields));
const dashboardAuth = new DashboardAuth({
  ...config.dashboard,
  ttlSeconds: config.dashboard.sessionTtlSeconds,
  secureCookies: config.dashboard.publicBaseUrl.startsWith('https://'),
});
await oauth.init();
let cyclePromise = null;
const SYSTEM_VERSION = '2.3.3';

function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

async function updateState(meta, mutate) {
  let before;
  const after = await store.update((current) => {
    before = structuredClone(current);
    return mutate(current);
  });
  try {
    await journal.recordTransition({
      before,
      after,
      type: meta.type,
      source: meta.source,
      sessionId: meta.sessionId,
      eventId: meta.eventId,
      details: meta.details,
      force: meta.force,
      at: meta.at,
    });
  } catch (error) {
    log('transition_journal_failed', { type: meta.type, message: error.message });
  }
  return after;
}

async function synchronizeOmbreHeartbeat() {
  let recordedAt;
  try {
    recordedAt = await readOmbreHeartbeat(config.heartbeat.filePath);
  } catch (error) {
    log('ombre_heartbeat_read_failed', { message: error.message });
    return null;
  }
  if (!recordedAt) return null;

  let observed = false;
  const state = await updateState({
    type: 'ombre_heartbeat',
    source: 'ombre-file',
    at: new Date(recordedAt),
  }, (current) => {
    const previous = Date.parse(current.lastHeartbeatAt ?? '');
    if (Number.isFinite(previous) && previous >= recordedAt.getTime()) return current;
    observed = true;
    return applyOmbreHeartbeat(current, recordedAt).state;
  });
  if (observed) log('ombre_heartbeat_observed', { revision: state.revision });
  return state;
}

async function runCycle() {
  if (cyclePromise) return cyclePromise;
  cyclePromise = (async () => {
    const now = new Date();
    await synchronizeOmbreHeartbeat();
    let settled;
    await updateState({
      type: 'settle',
      source: 'timer',
      at: now,
    }, (state) => {
      settled = settleState(state, now, config.sleepAfterMinutes, config.settle);
      return settled.state;
    });

    let state = settled.state;
    let dreamCreated = false;
    let barkSent = false;
    let daytimeSent = false;
    // Dream residue follows a short quiet period; autonomous contact remains
    // reserved for a genuine long absence.
    const dreamContactIsIdle = contactIdleAllowed(state, now, config.heartbeat.dreamMinIdleHours);
    const proactiveContactIsIdle = contactIdleAllowed(state, now, config.heartbeat.proactiveMinIdleHours);

    if (dreamAllowed(state, now, config.dreamMinIntervalHours, config.dreamMaxPerDay)) {
      let material = '';
      if (!config.shadowMode && config.ombre.readEnabled) {
        try { material = await ombre.recentMaterial(); }
        catch (error) { log('ombre_read_failed', { message: error.message }); }
      }

      let generated;
      if (config.shadowMode) {
        generated = new ModelClient({ ...config.model, enabled: false }).fallback(topDrives(state));
      } else {
        try {
          generated = await model.generateDream({ state, material, topDrives: topDrives(state) });
        } catch (error) {
          log('dream_model_failed', { message: error.message });
          generated = new ModelClient({ ...config.model, enabled: false }).fallback(topDrives(state));
        }
      }

      const dream = { id: randomUUID(), createdAt: now.toISOString(), ...generated, ombreBucketId: null };
      if (!config.shadowMode && config.ombre.writeEnabled) {
        try { dream.ombreBucketId = await ombre.storeDream(dream); }
        catch (error) { log('ombre_write_failed', { message: error.message }); }
      }

      state = await updateState({
        type: 'dream_recorded',
        source: config.shadowMode ? 'rule-seed' : 'model',
        details: { dreamCreated: true },
        at: now,
      }, (latest) => {
        if (!dreamAllowed(latest, now, config.dreamMinIntervalHours, config.dreamMaxPerDay)) return latest;
        return recordDream(latest, dream);
      });
      dreamCreated = true;
      log('dream_settled', { source: dream.source, shadow: config.shadowMode, usedBreath: Boolean(material), revision: state.revision });

      if (!config.shadowMode && config.bark.enabled && dreamContactIsIdle && barkAllowed(state, now, config.bark.minIntervalHours, config.bark.maxPerDay, 'dream')) {
        try {
          let modelFailed = false;
          const selected = await selectUniqueBark({
            state,
            onRejected: ({ attempt, similarity }) => log('bark_duplicate_rejected', { kind: 'dream', attempt, similarity }),
            generate: async ({ recentMessages, rejectedMessage }) => {
              if (modelFailed) return dream.residue;
              try {
                return await model.generateDreamPush({ dream, recentMessages, rejectedMessage });
              } catch (error) {
                modelFailed = true;
                log('dream_push_model_failed', { message: error.message });
                return dream.residue;
              }
            },
          });
          if (selected.reason === 'duplicate') {
            log('bark_duplicate_skipped', { kind: 'dream', attempts: selected.attempts });
          }
          if (selected.message) {
            const result = await bark.send(selected.message);
            if (result.sent) {
              state = await updateState({
                type: 'bark_sent',
                source: 'bark',
                details: { barkSent: true, kind: 'dream' },
                at: now,
              }, (latest) => recordBark(latest, now, { kind: 'dream', message: selected.message }));
              barkSent = true;
              log('bark_sent', { kind: 'dream', revision: state.revision });
            }
          }
        } catch (error) { log('bark_failed', { kind: 'dream', message: error.message }); }
      }
    }

    if (!config.shadowMode && config.bark.enabled && proactiveContactIsIdle && !dreamCreated && proactiveBarkAllowed(state, now, config.bark.autonomousMinIntervalHours, config.bark.maxPerDay, config.bark.minDrive)) {
      let selected;
      let modelFailed = false;
      try {
        selected = await selectUniqueBark({
          state,
          onRejected: ({ attempt, similarity }) => log('bark_duplicate_rejected', { kind: 'autonomous_thought', attempt, similarity }),
          generate: async ({ recentMessages, rejectedMessage }) => {
            if (modelFailed) return new ModelClient({ ...config.model, enabled: false }).fallbackThought(topDrives(state));
            try {
              return await model.generateThought({ state, topDrives: topDrives(state), recentMessages, rejectedMessage });
            } catch (error) {
              modelFailed = true;
              log('thought_model_failed', { message: error.message });
              return new ModelClient({ ...config.model, enabled: false }).fallbackThought(topDrives(state));
            }
          },
        });
      } catch (error) {
        log('thought_model_failed', { message: error.message });
        selected = { message: '', reason: 'empty', attempts: 1 };
      }
      if (selected.reason === 'duplicate') {
        log('bark_duplicate_skipped', { kind: 'autonomous_thought', attempts: selected.attempts });
      }
      if (selected.message) {
        try {
          const result = await bark.send(selected.message);
          if (result.sent) {
            state = await updateState({
              type: 'bark_sent',
              source: 'bark',
              details: { barkSent: true, kind: 'autonomous_thought' },
              at: now,
            }, (latest) => recordBark(latest, now, { kind: 'autonomous_thought', message: selected.message }));
            barkSent = true;
            log('bark_sent', { kind: 'autonomous_thought', source: selected.candidate?.source, revision: state.revision });
          }
        } catch (error) { log('bark_failed', { kind: 'autonomous_thought', message: error.message }); }
      }
    }

    if (!state.nextDaytimeEmergenceAt && config.daytime.enabled) {
      state = await updateState({
        type: 'daytime_emergence_scheduled',
        source: 'timer',
        at: now,
      }, (latest) => scheduleDaytimeEmergence(latest, now, config.daytime.minIntervalHours, config.daytime.maxIntervalHours));
      log('daytime_emergence_scheduled', { nextAt: state.nextDaytimeEmergenceAt, revision: state.revision });
    } else if (!config.shadowMode && config.daytime.enabled && config.ombre.readEnabled && config.bark.enabled && daytimeEmergenceAllowed(state, now, config.daytime)) {
      let selected = { message: '', candidate: { source: 'none' }, reason: 'empty', attempts: 1 };
      try {
        const material = await ombre.daytimeMaterial();
        if (material.trim()) {
          selected = await selectUniqueBark({
            state,
            onRejected: ({ attempt, similarity }) => log('bark_duplicate_rejected', { kind: 'daytime_emergence', attempt, similarity }),
            generate: ({ recentMessages, rejectedMessage }) => model.generateDaytimeEmergence({ material, recentMessages, rejectedMessage }),
          });
        }
      } catch (error) {
        log('daytime_emergence_failed', { message: error.message });
      }
      if (selected.reason === 'duplicate') {
        log('bark_duplicate_skipped', { kind: 'daytime_emergence', attempts: selected.attempts });
      }
      if (selected.message) {
        try {
          const result = await bark.send(selected.message);
          if (result.sent) {
            state = await updateState({
              type: 'daytime_emergence_sent',
              source: 'bark',
              details: { daytimeSent: true },
              at: now,
            }, (latest) => recordDaytimeEmergence(latest, selected.message, now, config.daytime.timeZone));
            daytimeSent = true;
            log('bark_sent', { kind: 'daytime_emergence', source: selected.candidate?.source, revision: state.revision });
          }
        } catch (error) {
          log('bark_failed', { kind: 'daytime_emergence', message: error.message });
        }
      } else {
        log('daytime_emergence_skipped', { reason: selected.reason === 'duplicate' ? 'duplicate' : 'no_pushworthy_material' });
      }
      state = await updateState({
        type: 'daytime_emergence_scheduled',
        source: 'timer',
        at: now,
      }, (latest) => scheduleDaytimeEmergence(latest, now, config.daytime.minIntervalHours, config.daytime.maxIntervalHours));
      log('daytime_emergence_scheduled', { nextAt: state.nextDaytimeEmergenceAt, revision: state.revision });
    }
    return { state, dreamCreated, barkSent, daytimeSent };
  })().finally(() => { cyclePromise = null; });
  return cyclePromise;
}

function safeEqual(supplied, expected) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function auditEventFingerprint(value) {
  const eventId = String(value ?? '').trim();
  return eventId
    ? createHash('sha256').update(eventId, 'utf8').digest('hex').slice(0, 24)
    : '';
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return safeEqual(supplied, config.serviceToken);
}

function mcpPath(url) {
  return url.pathname === '/mcp' || url.pathname.startsWith('/mcp/');
}

function transportSessionId(request, initialize = false) {
  const supplied = String(request.headers['mcp-session-id'] ?? '').trim();
  if (!initialize && /^[A-Za-z0-9._~-]{1,120}$/.test(supplied)) return supplied;
  return `mcp-${randomUUID()}`;
}

function negotiatedProtocolVersion(request, payload, result) {
  const supported = new Set(['2025-03-26', '2025-06-18']);
  const values = [
    result?.body?.result?.protocolVersion,
    request.headers['mcp-protocol-version'],
    payload?.params?.protocolVersion,
  ];
  return values.find((value) => supported.has(String(value))) ?? '2025-06-18';
}

function mcpAuthorized(request, url) {
  if (authorized(request)) return true;
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (oauth.validateAccessToken(bearer)) return true;
  if (!config.mcp.pathToken || !url.pathname.startsWith('/mcp/')) return false;
  const supplied = decodeURIComponent(url.pathname.slice('/mcp/'.length));
  return safeEqual(supplied, config.mcp.pathToken);
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

function dashboardTimelineOptions(url) {
  const types = url.searchParams.getAll('type')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    limit: url.searchParams.get('limit') ?? 50,
    since: url.searchParams.get('since') ?? '',
    types,
  };
}

async function dashboardPayload(pathname, url) {
  if (pathname.endsWith('/snapshot')) {
    return buildDashboardSnapshot(await store.read(), config, new Date());
  }
  if (pathname.endsWith('/timeline')) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      items: await journal.list(dashboardTimelineOptions(url)),
    };
  }
  if (pathname.endsWith('/connect')) return buildConnectionManifest(config);
  return null;
}

function sendMcp(response, status, value, extraHeaders = {}) {
  const headers = {
    'Cache-Control': 'no-store',
    ...extraHeaders,
  };
  if (value == null) {
    response.writeHead(status, headers);
    return response.end();
  }
  response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  return response.end(JSON.stringify(value));
}

async function createContextEnvelope({
  sessionId,
  mode = 'session_start',
  maxTokens = config.context.defaultMaxTokens,
  force = false,
  now = new Date(),
}) {
  let state = await store.read();
  const delivery = contextDeliveryState(state, sessionId, mode, now, config.context.handoffOnceHours);
  let ombreText = '';
  let ombreWarning = '';
  if (
    mode === 'session_start'
    && (!delivery.alreadyDelivered || force)
    && config.context.ombreEnabled
    && config.ombre.readEnabled
  ) {
    try {
      ombreText = await ombre.recentContinuityMaterial(config.context.ombreMaxTokens);
    } catch (error) {
      ombreWarning = 'ombre_unavailable';
      log('context_ombre_read_failed', { message: error.message });
    }
  }
  const envelope = buildContextEnvelope({
    state,
    sessionId,
    mode,
    ombreText,
    maxTokens,
    ttlMinutes: config.context.ttlMinutes,
    now,
    alreadyDelivered: delivery.alreadyDelivered,
    force,
  });
  if (envelope.delivered) {
    state = await updateState({
      type: 'context_delivery',
      source: 'context-adapter',
      sessionId,
      details: {
        delivered: true,
        force,
        mode,
        ombreIncluded: Boolean(ombreText),
        estimatedTokens: envelope.estimatedTokens,
        sectionCount: envelope.sections.length,
      },
      at: now,
    }, (current) => recordContextDelivery(current, {
      sessionId,
      mode,
      digest: envelope.digest,
      deliveredAt: now,
    }));
  }
  try {
    await journal.recordContext({
      mode,
      sessionId,
      digest: envelope.digest,
      estimatedTokens: envelope.estimatedTokens,
      sectionCount: envelope.sections.length,
      delivered: envelope.delivered,
      alreadyDelivered: envelope.alreadyDelivered,
      ombreIncluded: Boolean(ombreText),
      at: now,
    });
  } catch (error) {
    log('context_audit_failed', { message: error.message });
  }
  return ombreWarning ? { ...envelope, warnings: [ombreWarning] } : envelope;
}

async function recordConversationEvent(event, source = 'api', now = new Date()) {
  let applied;
  const auditDetails = {};
  const state = await updateState({
    type: source === 'heartbeat' ? 'conversation_heartbeat' : 'conversation_event',
    source: source === 'mcp' ? 'mcp' : 'api',
    sessionId: event.sessionId ?? event.session_id,
    eventId: auditEventFingerprint(event.eventId ?? event.event_id),
    details: auditDetails,
    at: now,
  }, (current) => {
    applied = settleAndApplyConversationEvent(current, event, now, {
      sleepAfterMinutes: config.sleepAfterMinutes,
      settle: config.settle,
      interaction: config.interaction,
    });
    Object.assign(auditDetails, {
      changed: applied.changed,
      duplicate: applied.duplicate,
      interactionApplied: applied.interaction?.applied,
      reasonCode: applied.interaction?.reasonCode,
      settledHours: Number(applied.settled.elapsedHours.toFixed(4)),
    });
    return applied.state;
  });
  return {
    revision: state.revision,
    consciousness: state.consciousness,
    pendingAwareness: state.pendingAwareness,
    sessionId: applied.sessionId || null,
    sessionCreated: applied.sessionCreated,
    duplicate: applied.duplicate,
    interaction: applied.interaction,
    settledHours: Number(applied.settled.elapsedHours.toFixed(4)),
  };
}

async function saveHandoffNote(note, source = 'mcp', now = new Date()) {
  let applied;
  const state = await updateState({
    type: 'handoff_note',
    source,
    sessionId: note.sessionId,
    eventId: auditEventFingerprint(note.eventId),
    details: {
      noteLength: String(note.note ?? '').length,
      ttlHours: note.ttlHours,
    },
    at: now,
  }, (current) => {
    applied = recordHandoffNote(current, { ...note, now });
    return applied.state;
  });
  return {
    revision: state.revision,
    duplicate: applied.duplicate,
    noteLength: applied.noteLength,
  };
}

function handoffNoteFromHttp(payload = {}) {
  return {
    sessionId: payload.sessionId ?? payload.session_id,
    eventId: payload.eventId ?? payload.event_id,
    note: payload.note,
    ttlHours: payload.ttlHours ?? payload.ttl_hours,
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, {
        ok: true,
        system: 'xinchao-dynamic-mind',
        mode: config.shadowMode ? 'shadow' : 'active',
        version: SYSTEM_VERSION,
      });
    }
    if (await oauth.handle(request, response, url)) return;
    if (url.pathname === '/dashboard/session') {
      if (!config.dashboard.enabled) return send(response, 404, { error: 'not found' });
      if (request.method !== 'POST') return send(response, 405, { error: 'method not allowed' }, { Allow: 'POST' });
      const remoteAddress = request.socket.remoteAddress ?? 'unknown';
      if (dashboardAuth.rateLimited(remoteAddress)) {
        return send(response, 429, { error: 'too many attempts' }, { 'Retry-After': '60' });
      }
      const payload = await body(request);
      const supplied = payload.accessToken ?? payload.access_token ?? payload.token ?? '';
      if (!dashboardAuth.verifyAccessToken(supplied, remoteAddress)) {
        return send(response, 401, { error: 'invalid credentials' });
      }
      const session = dashboardAuth.createSession();
      log('dashboard_session_created', { sessionExpiresAt: session.expiresAt });
      return send(response, 200, {
        ok: true,
        expiresAt: session.expiresAt,
        profile: 'read-only-dashboard',
      }, { 'Set-Cookie': dashboardAuth.sessionCookie(session.token) });
    }
    if (url.pathname === '/dashboard/logout') {
      if (request.method !== 'POST') return send(response, 405, { error: 'method not allowed' }, { Allow: 'POST' });
      dashboardAuth.destroyRequestSession(request);
      return send(response, 200, { ok: true }, { 'Set-Cookie': dashboardAuth.clearCookie() });
    }
    if (url.pathname.startsWith('/dashboard/api/')) {
      if (!dashboardAuth.validateRequest(request)) return send(response, 401, { error: 'unauthorized' });
      if (request.method !== 'GET') return send(response, 405, { error: 'method not allowed' }, { Allow: 'GET' });
      const payload = await dashboardPayload(url.pathname, url);
      return payload ? send(response, 200, payload) : send(response, 404, { error: 'not found' });
    }
    if (config.mcp.enabled && mcpPath(url)) {
      if (!mcpAuthorized(request, url)) {
        if (oauth.enabled) response.setHeader('WWW-Authenticate', oauth.wwwAuthenticate());
        return sendMcp(response, 401, { error: 'unauthorized' });
      }
      if (request.method === 'DELETE') {
        return sendMcp(response, 204, null, {
          'Mcp-Session-Id': transportSessionId(request),
          'MCP-Protocol-Version': '2025-06-18',
        });
      }
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, DELETE');
        return sendMcp(response, 405, { error: 'method not allowed' });
      }
      const payload = await body(request);
      const sessionId = transportSessionId(request, payload?.method === 'initialize');
      const result = await handleMcpMessage(payload, {
        defaultSessionId: sessionId,
        context: async (args) => {
          if (!config.context.enabled) throw new Error('心潮 Context Envelope 当前未启用');
          return createContextEnvelope(args);
        },
        event: async (event) => {
          const result = await recordConversationEvent(event, 'mcp');
          return {
            revision: result.revision,
            consciousness: result.consciousness,
            sessionId: result.sessionId,
            sessionCreated: result.sessionCreated,
            duplicate: result.duplicate,
            interaction: result.interaction,
            settledHours: result.settledHours,
          };
        },
        handoffNote: async (note) => saveHandoffNote(note, 'mcp'),
      });
      if (payload?.method === 'initialize' || payload?.method === 'tools/call') {
        log('mcp_request', {
          method: payload.method,
          tool: payload?.params?.name ? String(payload.params.name).slice(0, 80) : undefined,
          session: auditEventFingerprint(sessionId),
          status: result.status,
        });
      }
      return sendMcp(response, result.status, result.body, {
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': negotiatedProtocolVersion(request, payload, result),
      });
    }
    if (!authorized(request)) return send(response, 401, { error: 'unauthorized' });

    if (request.method === 'GET' && url.pathname.startsWith('/v1/dashboard/')) {
      const payload = await dashboardPayload(url.pathname, url);
      return payload ? send(response, 200, payload) : send(response, 404, { error: 'not found' });
    }

    if (request.method === 'GET' && url.pathname === '/v1/state') {
      return send(response, 200, await store.read());
    }
    if (request.method === 'GET' && url.pathname === '/v1/breath-context') {
      const state = await store.read();
      return send(response, 200, {
        ...breathDreamContext(state, new Date()),
        generatedAt: new Date().toISOString(),
      });
    }
    if (request.method === 'GET' && url.pathname === '/v1/context') {
      if (!config.context.enabled) return send(response, 503, { error: 'context envelope disabled' });
      const now = new Date();
      const sessionId = String(url.searchParams.get('session_id') ?? 'default').trim().slice(0, 120) || 'default';
      const requestedMode = String(url.searchParams.get('mode') ?? 'session_start').trim().toLowerCase();
      const mode = ['session_start', 'turn', 'inspect'].includes(requestedMode) ? requestedMode : 'session_start';
      const force = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('force') ?? '').toLowerCase());
      const maxTokens = Number(url.searchParams.get('max_tokens') ?? config.context.defaultMaxTokens);
      return send(response, 200, await createContextEnvelope({
        sessionId,
        mode,
        maxTokens,
        force,
        now,
      }));
    }
    if (request.method === 'GET' && url.pathname === '/v1/intent') {
      const state = await store.read();
      const intent = pickIntent(state);
      return send(response, 200, { intent, topDrives: topDrives(state), thoughtPool: state.thoughtPool ?? null, fatigue: state.fatigue ?? 0 });
    }
    if (request.method === 'POST' && url.pathname === '/v1/settle') {
      const result = await runCycle();
      return send(response, 200, { revision: result.state.revision, consciousness: result.state.consciousness, dreamCreated: result.dreamCreated, barkSent: result.barkSent, daytimeSent: result.daytimeSent });
    }
    if (request.method === 'POST' && (url.pathname === '/v1/conversation-event' || url.pathname === '/v1/heartbeat')) {
      const event = await body(request);
      const source = url.pathname === '/v1/heartbeat' ? 'heartbeat' : 'api';
      return send(response, 200, await recordConversationEvent(event, source));
    }
    if (request.method === 'POST' && url.pathname === '/v1/handoff-note') {
      const payload = await body(request);
      return send(response, 200, await saveHandoffNote(handoffNoteFromHttp(payload), 'api'));
    }
    if (request.method === 'POST' && url.pathname === '/v1/drive-feedback') {
      const payload = await body(request);
      const now = new Date();
      const state = await updateState({
        type: 'drive_feedback',
        source: 'api',
        eventId: payload.eventId ?? payload.event_id,
        at: now,
      }, (current) => applyDriveFeedback(current, payload.driveDeltas ?? {}, now));
      return send(response, 200, { revision: state.revision, topDrives: topDrives(state) });
    }
    return send(response, 404, { error: 'not found' });
  } catch (error) {
    log('request_failed', { message: error.message });
    return send(response, 400, { error: error.message });
  }
});

server.listen(config.port, '0.0.0.0', async () => {
  await store.read();
  log('service_started', { port: config.port, shadow: config.shadowMode, modelEnabled: config.model.enabled, barkEnabled: config.bark.enabled });
});

const timer = setInterval(() => runCycle().catch((error) => log('cycle_failed', { message: error.message })), config.settleIntervalMinutes * 60_000);
timer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
