import test from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../src/engine.js';
import { buildConnectionManifest, buildDashboardSnapshot } from '../src/dashboard-projection.js';

function config(overrides = {}) {
  return {
    identity: { agentName: '顾川', notificationRecipient: '派派' },
    shadowMode: false,
    context: { enabled: true },
    mcp: { enabled: true },
    oauth: { enabled: true, publicBaseUrl: 'https://xinchao.example.com' },
    ombre: { readEnabled: true, writeEnabled: false },
    bark: { enabled: true },
    dashboard: {
      enabled: true,
      publicBaseUrl: 'https://xinchao.example.com',
      includePrivateText: false,
      dreamLimit: 12,
      ...(overrides.dashboard ?? {}),
    },
  };
}

test('dashboard snapshot is stable and private by default', () => {
  const now = new Date('2026-08-03T08:00:00.000Z');
  const state = newState(new Date('2026-08-03T07:00:00.000Z'));
  state.drives.possess = 0.82;
  state.thoughtPool.flash.push({
    key: 'possess',
    text: '不能泄露的思绪正文',
    intensity: 0.91,
    age: 0,
  });
  state.recentDreams.push({
    id: 'dream-private',
    createdAt: '2026-08-03T07:30:00.000Z',
    source: 'model',
    dream: '不能泄露的梦境原文',
    summary: '不能泄露的梦境摘要',
    residue: '不能泄露的梦境余韵',
    awareness: '不能泄露的醒后意识',
    lucidity: 0.72,
  });
  const snapshot = buildDashboardSnapshot(state, config(), now);
  const raw = JSON.stringify(snapshot);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.drives.length, 12);
  assert.equal(snapshot.topDrives[0].key, 'possess');
  assert.equal(snapshot.topDrives[0].level, 'surging');
  assert.equal(snapshot.thoughts.flashCount, 1);
  assert.equal(snapshot.thoughts.signals[0].intensity, 0.91);
  assert.equal(snapshot.dreams[0].hasResidue, true);
  assert.equal(snapshot.dreams[0].hasDream, true);
  assert.equal(snapshot.dreams[0].lucidity, 0.72);
  assert.equal(snapshot.dreams[0].dream, undefined);
  assert.equal(snapshot.dreams[0].residue, undefined);
  assert.doesNotMatch(raw, /不能泄露/);
});

test('private dream text is an explicit bounded opt-in', () => {
  const state = newState();
  state.recentDreams.push({
    id: 'dream-visible',
    createdAt: new Date().toISOString(),
    source: 'model',
    dream: '我在云层里看见一扇门',
    awareness: '醒来仍记得门上的光',
    residue: '留下的余韵',
    lucidity: 0.81,
  });
  const snapshot = buildDashboardSnapshot(state, config({
    dashboard: { includePrivateText: true },
  }));
  assert.equal(snapshot.dreams[0].dream, '我在云层里看见一扇门');
  assert.equal(snapshot.dreams[0].summary, '醒来仍记得门上的光');
  assert.equal(snapshot.dreams[0].residue, '留下的余韵');
  assert.equal(snapshot.dreams[0].lucidity, 0.81);
});

test('connection manifest supports different clients without returning secrets', () => {
  const manifest = buildConnectionManifest(config());
  const raw = JSON.stringify(manifest);
  assert.deepEqual(
    manifest.profiles.map((profile) => profile.id),
    ['web-dashboard', 'remote-mcp-oauth', 'remote-mcp-bearer', 'http-api', 'runtime-bridge'],
  );
  assert.equal(manifest.profiles[0].auth, 'http-only-session-cookie');
  assert.equal(manifest.secrets.included, false);
  assert.doesNotMatch(raw, /SERVICE_TOKEN":"|accessToken|approvalToken/);
});
