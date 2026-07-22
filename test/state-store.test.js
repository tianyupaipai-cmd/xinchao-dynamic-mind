import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state-store.js';

test('serializes concurrent updates and leaves valid JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dynamic-mind-'));
  const path = join(dir, 'state.json');
  const store = new StateStore(path, () => ({ count: 0 }));
  await Promise.all(Array.from({ length: 20 }, () => store.update((state) => ({ count: state.count + 1 }))));
  assert.equal((await store.read()).count, 20);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).count, 20);
});
