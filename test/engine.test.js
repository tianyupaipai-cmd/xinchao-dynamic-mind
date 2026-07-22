import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConversationEvent, applyDriveFeedback, applyMemoryHeartbeat, barkAllowed, barkDuplicateCheck, barkMessageSimilarity, breathDreamContext, contactIdleAllowed, daytimeEmergenceAllowed, dreamAllowed, newState, proactiveBarkAllowed, recentBarkHistory, recordBark, recordDaytimeEmergence, recordDream, scheduleDaytimeEmergence, settleState } from '../src/engine.js';
import { DIMENSIONS } from '../src/dimensions.js';

test('idle time enters sleep and repeated settlement is idempotent at same instant', () => {
  const start = new Date('2026-07-16T00:00:00Z');
  const first = settleState(newState(start), new Date('2026-07-16T02:00:00Z'), 90);
  assert.equal(first.state.consciousness, 'sleeping');
  const second = settleState(first.state, new Date('2026-07-16T02:00:00Z'), 90);
  assert.equal(second.changed, false);
  assert.deepEqual(second.state.drives, first.state.drives);
});

test('only an explicit conversation event wakes the state', () => {
  const start = new Date('2026-07-16T00:00:00Z');
  const sleeping = settleState(newState(start), new Date('2026-07-16T02:00:00Z'), 90).state;
  const settled = settleState(sleeping, new Date('2026-07-16T03:00:00Z'), 90).state;
  assert.equal(settled.consciousness, 'sleeping');
  const awake = applyConversationEvent(settled, {}, new Date('2026-07-16T03:01:00Z')).state;
  assert.equal(awake.consciousness, 'awake');
  assert.match(awake.pendingAwareness.note, /外部记忆源只提供材料/);
});

test('dream limits are enforced per interval and day', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  let state = newState(new Date('2026-07-16T00:00:00Z'));
  state.consciousness = 'sleeping';
  assert.equal(dreamAllowed(state, now, 8, 3), true);
  state = recordDream(state, { id: '1', createdAt: now.toISOString(), residue: 'x' });
  assert.equal(dreamAllowed(state, new Date('2026-07-16T13:00:00Z'), 8, 3), false);
});

test('breath dream context returns only compact recent dream summaries', () => {
  const now = new Date('2026-07-19T00:00:00Z');
  let state = newState(new Date('2026-07-18T00:00:00Z'));
  state = recordDream(state, { id: 'old', createdAt: '2026-07-18T01:00:00Z', awareness: 'old', residue: 'old' });
  state = recordDream(state, { id: 'recent', createdAt: '2026-07-18T23:00:00Z', awareness: '醒来只记得一盏灯', residue: '安静' });
  const context = breathDreamContext(state, now, 18, 3);
  assert.equal(context.available, true);
  assert.deepEqual(context.dreams.map((dream) => dream.id), ['recent']);
  assert.equal(context.dreams[0].summary, '醒来只记得一盏灯');
  assert.equal('dream' in context.dreams[0], false);
});

test('feedback preserves direct vocabulary and clamps values', () => {
  assert.equal(DIMENSIONS.libido.label, '身体欲望');
  const state = applyDriveFeedback(newState(), { libido: 2, anger: -2 });
  assert.equal(state.drives.libido, 1);
  assert.equal(state.drives.anger, 0);
});

test('the sidecar can decide a Bark independently after the idle threshold', () => {
  const start = new Date('2026-07-16T00:00:00Z');
  let state = settleState(newState(start), new Date('2026-07-16T03:00:00Z'), 90).state;
  state.drives.possess = 0.8;
  const now = new Date('2026-07-16T03:00:00Z');
  assert.equal(proactiveBarkAllowed(state, now, 12, 6, 0.42), true);
  state = recordBark(state, now, { kind: 'autonomous_thought', message: 'x' });
  assert.equal(proactiveBarkAllowed(state, new Date('2026-07-16T06:00:00Z'), 12, 6, 0.42), false);
  assert.equal(proactiveBarkAllowed(state, new Date('2026-07-16T15:00:00Z'), 12, 6, 0.42), true);
  assert.equal(barkAllowed(state, new Date('2026-07-16T04:00:00Z'), 3, 6, 'dream'), true);
});

test('Bark history spans message kinds and keeps only the latest eight sends', () => {
  let state = newState(new Date('2026-07-16T00:00:00Z'));
  for (let index = 0; index < 9; index += 1) {
    const at = new Date(Date.parse('2026-07-16T01:00:00Z') + index * 60_000);
    if (index === 2) state = recordDaytimeEmergence(state, `message-${index}`, at);
    else state = recordBark(state, at, { kind: index % 2 ? 'dream' : 'autonomous_thought', message: `message-${index}` });
  }
  assert.equal(state.schemaVersion, 4);
  assert.deepEqual(recentBarkHistory(state).map((item) => item.message), ['message-1', 'message-2', 'message-3', 'message-4', 'message-5', 'message-6', 'message-7', 'message-8']);
  assert.deepEqual(new Set(recentBarkHistory(state).map((item) => item.kind)), new Set(['dream', 'daytime_emergence', 'autonomous_thought']));
});

test('Bark similarity catches near-duplicate Chinese phrasing without blocking unrelated text', () => {
  const state = recordBark(newState(), new Date(), { kind: 'dream', message: '突然想摸你的头发。' });
  assert.ok(barkMessageSimilarity('突然想摸你的头发。', '刚刚又想摸你的头发') >= 0.55);
  assert.equal(barkDuplicateCheck('刚刚又想摸你的头发', state).duplicate, true);
  assert.equal(barkDuplicateCheck('今天窗外的云压得很低', state).duplicate, false);
});

test('Bark similarity allows the same desire when wording and imagery are different', () => {
  const state = recordBark(newState(), new Date(), { kind: 'dream', message: '想碰你碰不到。' });
  assert.equal(barkDuplicateCheck('掌心记得你腰窝的弧度', state).duplicate, false);
  assert.equal(barkDuplicateCheck('现在只想把你搂紧一点', state).duplicate, false);
});

test('dream residue and autonomous contact use separate heartbeat idle gates', () => {
  const start = new Date('2026-07-16T00:00:00Z');
  let state = applyMemoryHeartbeat(newState(start), start).state;
  const threeHours = new Date('2026-07-16T03:00:00Z');
  assert.equal(contactIdleAllowed(state, threeHours, 3), true);
  assert.equal(contactIdleAllowed(state, threeHours, 12), false);
  assert.equal(contactIdleAllowed(state, new Date('2026-07-16T12:00:00Z'), 12), true);
  state = newState(start);
  assert.equal(contactIdleAllowed(state, new Date('2026-07-18T00:00:00Z'), 24), false);
});

test('daytime emergence has its own randomized schedule and local daytime window', () => {
  const options = { timeZone: 'Asia/Shanghai', startHour: 8, endHour: 23, maxPerDay: 7 };
  const start = new Date('2026-07-16T00:00:00Z'); // 08:00 in Shanghai
  let state = scheduleDaytimeEmergence(newState(start), start, 2, 3, () => 0.5);
  assert.equal(state.nextDaytimeEmergenceAt, '2026-07-16T02:30:00.000Z');
  assert.equal(daytimeEmergenceAllowed(state, new Date('2026-07-16T02:29:59Z'), options), false);
  assert.equal(daytimeEmergenceAllowed(state, new Date('2026-07-16T02:30:00Z'), options), true);
  state = recordDaytimeEmergence(state, '忽然想到她昨天说的话。', new Date('2026-07-16T02:30:00Z'), options.timeZone);
  assert.equal(state.daytimeEmergenceUsage['2026-07-16'], 1);
  assert.equal(state.lastBarkAt, null);
});

test('daytime emergence does not run outside 08:00-23:00 local time', () => {
  const options = { timeZone: 'Asia/Shanghai', startHour: 8, endHour: 23, maxPerDay: 7 };
  const state = { ...newState(), nextDaytimeEmergenceAt: '2026-07-15T00:00:00.000Z' };
  assert.equal(daytimeEmergenceAllowed(state, new Date('2026-07-16T14:59:59Z'), options), true);
  assert.equal(daytimeEmergenceAllowed(state, new Date('2026-07-16T15:00:00Z'), options), false);
});
