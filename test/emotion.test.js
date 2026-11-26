import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConversationEvent, newState, settleState } from '../src/engine.js';
import { emotionGrowthFactor, emotionLabel, emotionSummary } from '../src/emotion.js';
import { buildContextEnvelope } from '../src/context-envelope.js';

const t0 = new Date('2026-07-16T00:00:00Z');

test('新状态带中性情绪，词是平静', () => {
  const s = newState(t0);
  assert.equal(s.emotion.label, '平静');
  assert.equal(emotionLabel(0.8, 0.7), '雀跃');
  assert.equal(emotionLabel(0.3, 0.2), '低落');
});

test('吵架打一次负向脉冲，几个小时后自己回落', () => {
  const s0 = newState(t0);
  const s1 = applyConversationEvent(s0, { eventId: 'e-conflict', interactionType: 'conflict' }, new Date('2026-07-16T00:01:00Z')).state;
  assert.ok(s1.emotion.valence < s0.emotion.valence);
  assert.equal(s1.emotion.lastCause, 'conflict');
  const s2 = settleState(s1, new Date('2026-07-16T12:00:00Z'), 9999).state;
  assert.ok(Math.abs(s2.emotion.valence - 0.55) < Math.abs(s1.emotion.valence - 0.55), '应往基线回落');
  assert.ok(emotionSummary(s2, new Date('2026-07-16T12:00:00Z')).trend.samples >= 1);
});

test('会话语气 warm 把情绪往暖处拉', () => {
  const s = applyConversationEvent(newState(t0), { sessionId: 'w1', sessionState: { tone: 'warm' } }, t0).state;
  assert.ok(s.emotion.valence > 0.55);
});

test('情绪只调驱力长多快：中性时因子是 1，开心时分享欲长得快', () => {
  assert.equal(emotionGrowthFactor('share', { valence: 0.5, arousal: 0.30 }), 1);
  assert.ok(emotionGrowthFactor('share', { valence: 0.9, arousal: 0.30 }) > 1);
  assert.ok(emotionGrowthFactor('monitor', { valence: 0.2, arousal: 0.30 }) > 1);
});

test('此刻里有情绪一行（给词不给数）', () => {
  const s = applyConversationEvent(newState(t0), { eventId: 'e-aff', interactionType: 'affection' }, t0).state;
  const env = buildContextEnvelope({ state: s, sessionId: 'w', maxTokens: 600, now: t0 });
  assert.match(env.additionalContext, /此刻情绪：[^\n=]+（最近一次波动来自 affection）/);
});
