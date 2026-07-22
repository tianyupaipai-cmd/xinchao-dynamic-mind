import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';
import { applyConversationEvent, applyDriveFeedback, applyMemoryHeartbeat, barkAllowed, breathDreamContext, contactIdleAllowed, daytimeEmergenceAllowed, dreamAllowed, newState, pickIntent, proactiveBarkAllowed, recordBark, recordDaytimeEmergence, recordDream, scheduleDaytimeEmergence, settleState, topDrives } from './engine.js';
import { selectUniqueBark } from './bark-dedupe.js';
import { StateStore } from './state-store.js';
import { ModelClient } from './model-client.js';
import { MemoryClient } from './memory-client.js';
import { BarkClient } from './bark-client.js';
import { readMemoryHeartbeat } from './heartbeat-store.js';

const config = loadConfig();
if (!config.serviceToken) throw new Error('SERVICE_TOKEN is required');

const store = new StateStore(config.statePath, () => newState());
const model = new ModelClient(config.model);
const memory = new MemoryClient(config.memory);
const bark = new BarkClient(config.bark);
let cyclePromise = null;

function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

async function synchronizeMemoryHeartbeat() {
  let recordedAt;
  try {
    recordedAt = await readMemoryHeartbeat(config.heartbeat.filePath);
  } catch (error) {
    log('memory_heartbeat_read_failed', { message: error.message });
    return null;
  }
  if (!recordedAt) return null;

  let observed = false;
  const state = await store.update((current) => {
    const previous = Date.parse(current.lastHeartbeatAt ?? '');
    if (Number.isFinite(previous) && previous >= recordedAt.getTime()) return current;
    observed = true;
    return applyMemoryHeartbeat(current, recordedAt).state;
  });
  if (observed) log('memory_heartbeat_observed', { revision: state.revision });
  return state;
}

async function runCycle() {
  if (cyclePromise) return cyclePromise;
  cyclePromise = (async () => {
    const now = new Date();
    await synchronizeMemoryHeartbeat();
    let settled;
    await store.update((state) => {
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
      if (!config.shadowMode && config.memory.readEnabled) {
        try { material = await memory.recentMaterial(); }
        catch (error) { log('memory_read_failed', { message: error.message }); }
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

      const dream = { id: randomUUID(), createdAt: now.toISOString(), ...generated, memoryRecordId: null };
      if (!config.shadowMode && config.memory.writeEnabled) {
        try { dream.memoryRecordId = await memory.storeDream(dream); }
        catch (error) { log('memory_write_failed', { message: error.message }); }
      }

      state = await store.update((latest) => {
        if (!dreamAllowed(latest, now, config.dreamMinIntervalHours, config.dreamMaxPerDay)) return latest;
        return recordDream(latest, dream);
      });
      dreamCreated = true;
      log('dream_settled', { source: dream.source, shadow: config.shadowMode, usedMemory: Boolean(material), revision: state.revision });

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
              state = await store.update((latest) => recordBark(latest, now, { kind: 'dream', message: selected.message }));
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
            state = await store.update((latest) => recordBark(latest, now, { kind: 'autonomous_thought', message: selected.message }));
            barkSent = true;
            log('bark_sent', { kind: 'autonomous_thought', source: selected.candidate?.source, revision: state.revision });
          }
        } catch (error) { log('bark_failed', { kind: 'autonomous_thought', message: error.message }); }
      }
    }

    if (!state.nextDaytimeEmergenceAt && config.daytime.enabled) {
      state = await store.update((latest) => scheduleDaytimeEmergence(latest, now, config.daytime.minIntervalHours, config.daytime.maxIntervalHours));
      log('daytime_emergence_scheduled', { nextAt: state.nextDaytimeEmergenceAt, revision: state.revision });
    } else if (!config.shadowMode && config.daytime.enabled && config.memory.readEnabled && config.bark.enabled && daytimeEmergenceAllowed(state, now, config.daytime)) {
      let selected = { message: '', candidate: { source: 'none' }, reason: 'empty', attempts: 1 };
      try {
        const material = await memory.daytimeMaterial();
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
            state = await store.update((latest) => recordDaytimeEmergence(latest, selected.message, now, config.daytime.timeZone));
            daytimeSent = true;
            log('bark_sent', { kind: 'daytime_emergence', source: selected.candidate?.source, revision: state.revision });
          }
        } catch (error) {
          log('bark_failed', { kind: 'daytime_emergence', message: error.message });
        }
      } else {
        log('daytime_emergence_skipped', { reason: selected.reason === 'duplicate' ? 'duplicate' : 'no_pushworthy_material' });
      }
      state = await store.update((latest) => scheduleDaytimeEmergence(latest, now, config.daytime.minIntervalHours, config.daytime.maxIntervalHours));
      log('daytime_emergence_scheduled', { nextAt: state.nextDaytimeEmergenceAt, revision: state.revision });
    }
    return { state, dreamCreated, barkSent, daytimeSent };
  })().finally(() => { cyclePromise = null; });
  return cyclePromise;
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(config.serviceToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { ok: true, mode: config.shadowMode ? 'shadow' : 'active', version: '2.0.0' });
    }
    if (!authorized(request)) return send(response, 401, { error: 'unauthorized' });

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
      const now = new Date();
      const state = await store.update((current) => applyConversationEvent(current, event, now).state);
      return send(response, 200, { revision: state.revision, consciousness: state.consciousness, pendingAwareness: state.pendingAwareness });
    }
    if (request.method === 'POST' && url.pathname === '/v1/drive-feedback') {
      const payload = await body(request);
      const state = await store.update((current) => applyDriveFeedback(current, payload.driveDeltas ?? {}, new Date()));
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
