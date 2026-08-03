import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(projectDir, 'src', 'server.js');

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`心潮测试服务提前退出：${output.value}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The child may still be binding its loopback port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`等待心潮测试服务启动超时：${output.value}`);
}

test('POST /v1/handoff-note stores a bounded idempotent note for HTTP clients', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-http-api-'));
  const port = await freePort();
  const token = 'http-api-test-token';
  const dashboardToken = 'dashboard-http-test-token-32-characters';
  const baseUrl = `http://127.0.0.1:${port}`;
  const output = { value: '' };
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port),
      SERVICE_TOKEN: token,
      STATE_PATH: join(directory, 'state.json'),
      TRANSITION_JOURNAL_PATH: join(directory, 'transitions.jsonl'),
      OAUTH_STATE_PATH: join(directory, 'oauth.json'),
      OMBRE_HEARTBEAT_FILE: join(directory, 'missing-heartbeat.json'),
      SETTLE_INTERVAL_MINUTES: '1440',
      SHADOW_MODE: 'true',
      MODEL_ENABLED: 'false',
      BARK_ENABLED: 'false',
      DAYTIME_EMERGENCE_ENABLED: 'false',
      CONTEXT_OMBRE_ENABLED: 'false',
      MCP_ENABLED: 'false',
      OAUTH_ENABLED: 'false',
      DASHBOARD_ENABLED: 'true',
      DASHBOARD_ACCESS_TOKEN: dashboardToken,
      DASHBOARD_PUBLIC_BASE_URL: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output.value += chunk; });
  child.stderr.on('data', (chunk) => { output.value += chunk; });

  t.after(async () => {
    if (child.exitCode == null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await rm(directory, { recursive: true, force: true });
  });

  await waitForHealth(baseUrl, child, output);
  const note = 'HTTP 客户端的近期进度';

  const heartbeat = await fetch(`${baseUrl}/v1/heartbeat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      session_id: 'http-window',
      event_id: 'heartbeat-http-1',
    }),
  });
  assert.equal(heartbeat.status, 200);
  const heartbeatResult = await heartbeat.json();
  assert.equal(heartbeatResult.sessionId, 'http-window');
  assert.equal(heartbeatResult.duplicate, false);

  const stateAfterHeartbeat = await fetch(`${baseUrl}/v1/state`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(stateAfterHeartbeat.status, 200);
  const heartbeatState = await stateAfterHeartbeat.json();
  assert.ok(Number.isFinite(Date.parse(heartbeatState.lastHeartbeatAt)));
  assert.equal(heartbeatState.lastHeartbeatAt, heartbeatState.lastConversationAt);

  const unauthorized = await fetch(`${baseUrl}/v1/handoff-note`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: 'http-window',
      event_id: 'handoff-http-1',
      note,
    }),
  });
  assert.equal(unauthorized.status, 401);

  const request = () => fetch(`${baseUrl}/v1/handoff-note`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      session_id: 'http-window',
      event_id: 'handoff-http-1',
      note,
      ttl_hours: 48,
    }),
  });

  const first = await request();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    revision: heartbeatState.revision + 1,
    duplicate: false,
    noteLength: note.length,
  });

  const repeated = await request();
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), {
    revision: heartbeatState.revision + 1,
    duplicate: true,
    noteLength: note.length,
  });

  const context = await fetch(
    `${baseUrl}/v1/context?mode=inspect&session_id=http-window&force=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(context.status, 200);
  const envelope = await context.json();
  assert.ok(envelope.sections.some((section) => section.id === 'handoff_notes'));
  assert.match(envelope.additionalContext, /HTTP 客户端的近期进度/);

  const dashboardUnauthorized = await fetch(`${baseUrl}/dashboard/api/snapshot`);
  assert.equal(dashboardUnauthorized.status, 401);

  const badLogin = await fetch(`${baseUrl}/dashboard/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: 'wrong' }),
  });
  assert.equal(badLogin.status, 401);

  const login = await fetch(`${baseUrl}/dashboard/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: dashboardToken }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /xinchao_dashboard=/);
  assert.match(cookie, /HttpOnly/);

  const dashboardSnapshot = await fetch(`${baseUrl}/dashboard/api/snapshot`, {
    headers: { cookie },
  });
  assert.equal(dashboardSnapshot.status, 200);
  const snapshot = await dashboardSnapshot.json();
  assert.equal(snapshot.system, 'xinchao-dynamic-mind');
  assert.equal(snapshot.drives.length, 12);
  assert.equal(snapshot.capabilities.privateDreamText, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /HTTP 客户端的近期进度/);

  const serviceSnapshot = await fetch(`${baseUrl}/v1/dashboard/snapshot`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(serviceSnapshot.status, 200);

  const timeline = await fetch(`${baseUrl}/dashboard/api/timeline?limit=10`, {
    headers: { cookie },
  });
  assert.equal(timeline.status, 200);
  const timelineResult = await timeline.json();
  assert.ok(timelineResult.items.some((item) => item.type === 'handoff_note'));
  assert.doesNotMatch(JSON.stringify(timelineResult), /HTTP 客户端的近期进度/);

  const manifest = await fetch(`${baseUrl}/dashboard/api/connect`, {
    headers: { cookie },
  });
  assert.equal(manifest.status, 200);
  const manifestResult = await manifest.json();
  assert.equal(manifestResult.profiles.find((item) => item.id === 'web-dashboard').enabled, true);
  assert.doesNotMatch(JSON.stringify(manifestResult), new RegExp(token));
  assert.doesNotMatch(JSON.stringify(manifestResult), new RegExp(dashboardToken));
});
