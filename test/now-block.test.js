import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConversationEvent, newState, noteMemoryDrive, settleState } from '../src/engine.js';
import { buildNowCompact } from '../src/now-block.js';
import { bodyLine, computeVitals } from '../src/pulse.js';

const t0 = new Date('2026-07-16T02:00:00Z');
const fresh = () => settleState(newState(t0), t0, 9999).state;

test('此刻块：驱力带档位和来由，情绪给词，身体一行，没有小数和驱力 key', () => {
  let s = fresh();
  s.drives.curiosity = 0.95;
  s = noteMemoryDrive(s, 'curiosity', { text: '那本没看完的书', date: '07/10', id: 'b1' }, t0);
  s = applyConversationEvent(s, { eventId: 'e-1', interactionType: 'companionship' }, t0).state;
  const body = bodyLine(computeVitals(s, t0));
  const seen = new Set();
  const r = buildNowCompact(s, t0, { body, extra: ['正一起看电影'], memoryCauses: seen });
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /^【心潮·此刻】/);
  assert.match(r.text, /驱力：好奇（涌；想起 07\/10：「那本没看完的书」）/);
  assert.match(r.text, /情绪：.+；刚才陪着/);
  assert.match(r.text, /身体：心跳 \d+，呼吸/);
  assert.match(r.text, /正一起看电影/);
  assert.doesNotMatch(r.text, /\d\.\d|possess|curiosity/);
  assert.equal(r.digest.length, 16);
  for (const k of r.memoryCauseKeys) seen.add(k);
  const again = buildNowCompact(s, t0, { body, memoryCauses: seen });
  assert.match(again.text, /好奇（涌；被一段旧事勾起）/);
});

test('状态太旧或驱力全卡在高值：整块不给', () => {
  const s = fresh();
  assert.equal(buildNowCompact(s, new Date('2026-07-16T06:00:00Z')).reason, 'stale_state');
  const flat = fresh();
  for (const k of Object.keys(flat.drives)) flat.drives[k] = 0.7;
  assert.equal(buildNowCompact(flat, t0).reason, 'drives_flat');
});

test('块满了外接的行先让位', () => {
  const s = fresh();
  const extra = Array.from({ length: 10 }, (_, i) => `外接第 ${i} 行，写得长一点占地方`);
  const r = buildNowCompact(s, t0, { extra });
  assert.equal(r.ok, true);
  assert.ok(r.lines <= 8);
});
