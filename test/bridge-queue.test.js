import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BridgeQueue } from '../src/bridge-queue.js';

test('Bridge queue persists, deduplicates and acknowledges user interactions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const queue = new BridgeQueue(join(directory, 'queue.json'));
  const now = new Date('2026-08-03T09:00:00.000Z');
  const first = await queue.enqueue({
    eventId: 'user-action-0001',
    reason: 'user_interaction',
    message: '用户给了你一个拥抱。',
  }, now);
  const repeated = await queue.enqueue({
    eventId: 'user-action-0001',
    reason: 'user_interaction',
    message: '不能覆盖首次投递。',
  }, now);
  assert.equal(first.duplicate, false);
  assert.equal(repeated.duplicate, true);
  assert.equal((await queue.ready(now)).length, 1);
  const envelope = await queue.get(first.delivery.id, now);
  assert.equal(envelope.protocol, 'xinchao-runtime-wake/1');
  assert.equal(envelope.reason, 'user_interaction');
  assert.equal(envelope.message, '用户给了你一个拥抱。');
  const acknowledged = await queue.acknowledge(first.delivery.id, 'delivered', '', now);
  assert.equal(acknowledged.status, 'delivered');
  assert.equal((await queue.ready(now)).length, 0);
});

test('Bridge queue rejects autonomous AI content', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const queue = new BridgeQueue(join(directory, 'queue.json'));
  await assert.rejects(() => queue.enqueue({
    eventId: 'autonomous-dream-1',
    reason: 'dream_residue',
    message: '梦境不允许自动注入。',
  }), /user interactions only/);
});
