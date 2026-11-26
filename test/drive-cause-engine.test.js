import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConversationEvent, applyDriveFeedback, driveTrend, newState, noteMemoryDrive, settleState } from '../src/engine.js';
import { driveLevel } from '../src/dimensions.js';
import { buildContextEnvelope } from '../src/context-envelope.js';
import { driveCause } from '../src/drive-causes.js';

const now = new Date('2026-07-16T03:00:00Z');

test('互动后记下来由：sharing 让分享欲缓下来', () => {
  const s0 = newState(new Date('2026-07-16T00:00:00Z'));
  s0.drives.share = 0.6;
  const s = applyConversationEvent(s0, { eventId: 'e1', interactionType: 'sharing' }, now).state;
  assert.equal(s.driveCauses.share?.kind, 'relief');
  assert.equal(driveCause(s, 'share', '', now, null, []), '她分享之后缓了些');
});

test('satisfiedDrives 与 drive feedback 都会记来由', () => {
  const s0 = newState(new Date('2026-07-16T00:00:00Z'));
  const s1 = applyConversationEvent(s0, { satisfiedDrives: ['curiosity'] }, now).state;
  assert.equal(driveCause(s1, 'curiosity', '', now, null, []), '刚被满足');
  const s2 = applyDriveFeedback(s1, { boredom: 0.05 }, now);
  assert.equal(driveCause(s2, 'boredom', '', now, null, []), '你自己觉得涨了');
});

test('noteMemoryDrive：宿主喂记忆来由，只记来由不改驱力值', () => {
  const s0 = newState(new Date('2026-07-16T00:00:00Z'));
  const s = noteMemoryDrive(s0, 'social', { text: '那天在海边一起捡贝壳', date: '07/01', id: 'm1' }, now);
  assert.equal(s.drives.social, s0.drives.social);
  assert.match(driveCause(s, 'social', '', now, new Set(), []), /想起 07\/01：「那天在海边/);
  assert.equal(noteMemoryDrive(s0, 'not_a_drive', { text: 'x' }, now).driveCauses?.not_a_drive, undefined);
});

test('此刻的「当前驱力」带上来由', () => {
  const s0 = newState(new Date('2026-07-16T00:00:00Z'));
  s0.drives.social = 0.9;
  const s = noteMemoryDrive(s0, 'social', { text: '那天在海边一起捡贝壳', date: '07/01', id: 'm1' }, now);
  const env = buildContextEnvelope({ state: s, sessionId: 'w', maxTokens: 600, now });
  assert.match(env.additionalContext, /=0\.900（涌·想起 07\/01：「那天在海边一起捡贝壳」）/);
});

test('驱力轨迹 30 分钟一点，两小时涨了算「涨」，没记来由时说「没被满足，自己慢慢涨」', () => {
  const t0 = new Date('2026-07-16T00:00:00Z');
  let s = settleState(newState(t0), t0, 9999).state;
  assert.equal(s.driveTrail.length, 1);
  s.drives.curiosity = 0.5;
  const t2 = new Date('2026-07-16T02:10:00Z');
  s = settleState(s, t2, 9999).state;
  assert.ok(s.driveTrail.length >= 2);
  const d = driveTrend(s, 'curiosity', t2);
  assert.ok(d >= 0.08, `trend ${d}`);
  const lv = driveLevel('curiosity', s.drives.curiosity, d);
  assert.equal(lv, '涨');
  const env = buildContextEnvelope({ state: s, sessionId: 'w', maxTokens: 600, now: t2 });
  assert.match(env.additionalContext, /好奇、想探索新东西=0\.\d+（涨·没被满足，自己慢慢涨）/);
});
