import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newState } from '../src/engine.js';
import { TransitionJournal } from '../src/transition-journal.js';

test('transition journal stores structured deltas without private plaintext', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-journal-'));
  const path = join(directory, 'transitions.jsonl');
  const journal = new TransitionJournal(path);
  const before = newState(new Date('2026-07-28T00:00:00Z'));
  const after = structuredClone(before);
  after.drives.curiosity = 0.4;
  after.revision += 1;

  await journal.recordTransition({
    before,
    after,
    type: 'conversation_event',
    details: {
      changed: true,
      dreamCreated: false,
      interactionApplied: true,
      interactionType: 'intimacy',
      settledHours: 0.25,
      message: '绝不能进入日志的私密正文',
      content: '也不能进入日志',
    },
  });
  const raw = await readFile(path, 'utf8');
  const record = JSON.parse(raw.trim());

  assert.equal(record.type, 'conversation_event');
  assert.equal(record.details.changed, true);
  assert.equal(record.details.dreamCreated, false);
  assert.equal(record.details.interactionApplied, true);
  assert.equal(record.details.settledHours, 0.25);
  assert.equal(record.details.interactionType, undefined);
  assert.equal(record.details.message, undefined);
  assert.equal(record.details.content, undefined);
  assert.equal(record.delta.driveDeltas.curiosity, 0.25);
  assert.doesNotMatch(raw, /私密正文|也不能进入日志/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('context audit records only digest and delivery metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xinchao-context-audit-'));
  const path = join(directory, 'transitions.jsonl');
  const journal = new TransitionJournal(path);
  await journal.recordContext({
    mode: 'session_start',
    sessionId: 'window-a',
    digest: '0123456789abcdef',
    estimatedTokens: 320,
    sectionCount: 3,
    delivered: true,
    alreadyDelivered: false,
    ombreIncluded: true,
  });
  const record = JSON.parse((await readFile(path, 'utf8')).trim());
  assert.equal(record.contextDigest, '0123456789abcdef');
  assert.equal(record.details.estimatedTokens, 320);
  assert.equal('content' in record, false);
});
