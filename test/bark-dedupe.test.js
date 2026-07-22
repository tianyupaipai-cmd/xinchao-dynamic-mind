import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUniqueBark } from '../src/bark-dedupe.js';
import { newState, recordBark } from '../src/engine.js';

test('a duplicate Bark is regenerated once and a different retry is accepted', async () => {
  const state = recordBark(newState(), new Date(), { kind: 'dream', message: '突然想摸你的头发。' });
  const calls = [];
  const selected = await selectUniqueBark({
    state,
    generate: async (context) => {
      calls.push(context);
      return calls.length === 1 ? '刚刚又想摸你的头发' : '今天窗外的云压得很低';
    },
  });
  assert.equal(selected.message, '今天窗外的云压得很低');
  assert.equal(selected.attempts, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].recentMessages.length, 1);
  assert.equal(calls[1].rejectedMessage, '刚刚又想摸你的头发');
});

test('two duplicate candidates are skipped and never trigger a third generation', async () => {
  const state = recordBark(newState(), new Date(), { kind: 'dream', message: '突然想摸你的头发。' });
  let calls = 0;
  const selected = await selectUniqueBark({
    state,
    generate: async () => {
      calls += 1;
      return '刚刚又想摸你的头发';
    },
  });
  assert.equal(selected.message, '');
  assert.equal(selected.reason, 'duplicate');
  assert.equal(selected.attempts, 2);
  assert.equal(calls, 2);
});

test('a model decision not to send is accepted without retry', async () => {
  let calls = 0;
  const selected = await selectUniqueBark({
    state: newState(),
    generate: async () => {
      calls += 1;
      return { send: false, message: '', source: 'model' };
    },
  });
  assert.equal(selected.reason, 'empty');
  assert.equal(calls, 1);
});
