import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHandoffNotes, recordHandoffNote } from '../src/handoff-notes.js';
import { newState } from '../src/engine.js';

test('handoff notes are idempotent, bounded and expire', () => {
  const now = new Date('2026-07-29T02:00:00Z');
  const first = recordHandoffNote(newState(now), {
    sessionId: 'old-window',
    eventId: 'handoff-1',
    note: '正在修复保守召回；下一步跑线上烟测。',
    ttlHours: 72,
    now,
  });
  assert.equal(first.duplicate, false);
  assert.equal(activeHandoffNotes(first.state, now).length, 1);

  const repeated = recordHandoffNote(first.state, {
    sessionId: 'old-window',
    eventId: 'handoff-1',
    note: '重试时即使文字不同，也不能重复写。',
    ttlHours: 72,
    now,
  });
  assert.equal(repeated.duplicate, true);
  assert.equal(activeHandoffNotes(repeated.state, now).length, 1);
  assert.equal(
    activeHandoffNotes(repeated.state, new Date('2026-08-02T03:00:00Z')).length,
    0,
  );
});

test('handoff note keeps a compact summary instead of an unbounded transcript', () => {
  const now = new Date('2026-07-29T02:00:00Z');
  const result = recordHandoffNote(newState(now), {
    sessionId: 'old-window',
    eventId: 'handoff-long',
    note: '近况'.repeat(1000),
    now,
  });
  assert.equal(activeHandoffNotes(result.state, now)[0].note.length, 1200);
});
