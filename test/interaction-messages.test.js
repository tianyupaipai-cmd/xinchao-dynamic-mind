import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTION_BRIDGE_MESSAGES, buildInteractionBridgeMessage } from '../src/interaction-messages.js';
import { INTERACTION_TYPES } from '../src/engine.js';

test('every supported interaction has its own sentence, and no dead entries', () => {
  const covered = Object.keys(INTERACTION_BRIDGE_MESSAGES).sort();
  const supported = [...INTERACTION_TYPES].sort();
  // 少一个 → 那种互动只会收到最泛的兜底句；多一个 → 永远走不到的死条目。
  assert.deepEqual(covered, supported);
});

test('the message names who, what, and which petals it landed on', () => {
  const message = buildInteractionBridgeMessage({
    interactionType: 'affection',
    recipient: '小雨',
    result: { interaction: { applied: true, reasonCode: 'applied', affectedDrives: ['libido', 'crave'] } },
  });

  assert.match(message, /^小雨/);
  assert.match(message, /拥抱/);
  assert.match(message, /落在.+上/);
  // 花瓣要用维度表里的中文名，不是内部 key。
  assert.doesNotMatch(message, /libido|crave/);
});

test('it does not claim an effect that the daily limit blocked', () => {
  const message = buildInteractionBridgeMessage({
    interactionType: 'affection',
    recipient: '小雨',
    result: { interaction: { applied: false, reasonCode: 'daily_effect_limit', affectedDrives: [] } },
  });

  assert.doesNotMatch(message, /落在/);
  assert.match(message, /到上限/);
});

test('it asks for the callback, because the reply is what does not register on its own', () => {
  const message = buildInteractionBridgeMessage({
    interactionType: 'companionship',
    recipient: '小雨',
    result: { interaction: { affectedDrives: ['social'] } },
  });
  assert.match(message, /回传/);
});

test('an unset recipient reads as a person, never as 用户', () => {
  const message = buildInteractionBridgeMessage({
    interactionType: 'affection',
    recipient: '',
    result: {},
  });
  assert.match(message, /^你的人类/);
  assert.doesNotMatch(message, /用户/);
});

test('an unknown interaction type still produces a usable sentence', () => {
  const message = buildInteractionBridgeMessage({
    interactionType: 'not_a_real_type',
    recipient: '小雨',
    result: {},
  });
  assert.match(message, /小雨刚刚从心潮小屋发来一次互动/);
});
