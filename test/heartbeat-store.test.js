import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOmbreHeartbeat } from '../src/heartbeat-store.js';

test('reads Ombre server timestamps and fails closed for a missing file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ombre-heartbeat-'));
  const file = join(directory, 'heartbeat.json');
  assert.equal(await readOmbreHeartbeat(file), null);
  await writeFile(file, JSON.stringify({ recordedAt: '2026-07-16T00:00:00.000Z' }));
  assert.equal((await readOmbreHeartbeat(file)).toISOString(), '2026-07-16T00:00:00.000Z');
});
