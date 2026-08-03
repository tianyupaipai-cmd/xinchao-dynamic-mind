import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeWakeBridgeEnvelope,
  createWakeBridgeEnvelope,
  markWakeBridgeDelivered,
} from '../src/wake-bridge-protocol.js';

test('Wake Bridge keeps human and AI delivery payloads separate', () => {
  const now = new Date('2026-08-03T08:00:00.000Z');
  const envelope = createWakeBridgeEnvelope({
    kind: 'pending_from_me',
    audience: 'both',
    humanMessage: '下午翻到一部想和你分享的电影。',
    aiContext: { summary: '独处时发现了一部电影', drive: 'share' },
    dedupeKey: 'share-film-1',
    now,
  });
  assert.equal(envelope.protocol, 'xinchao-wake-bridge/1');
  assert.equal(envelope.status, 'pending');
  assert.equal(envelope.human.message, '下午翻到一部想和你分享的电影。');
  assert.equal(envelope.ai.context.drive, 'share');

  const delivered = markWakeBridgeDelivered(envelope, new Date('2026-08-03T08:01:00.000Z'));
  const consumed = consumeWakeBridgeEnvelope(delivered, new Date('2026-08-03T08:02:00.000Z'));
  assert.equal(delivered.status, 'delivered');
  assert.equal(consumed.status, 'consumed');
  assert.equal(consumed.delivery.consumedAt, '2026-08-03T08:02:00.000Z');
});

test('Wake Bridge rejects credentials and raw conversation payloads', () => {
  assert.throws(() => createWakeBridgeEnvelope({
    kind: 'action_result',
    audience: 'ai',
    aiContext: { authorization: 'Bearer secret' },
  }), /not allowed/);
  assert.throws(() => createWakeBridgeEnvelope({
    kind: 'action_result',
    audience: 'ai',
    aiContext: { nested: { raw_chat: ['private'] } },
  }), /not allowed/);
});
