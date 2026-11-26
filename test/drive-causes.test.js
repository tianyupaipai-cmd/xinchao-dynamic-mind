import test from 'node:test';
import assert from 'node:assert/strict';
import { driveCause, noDecimal } from '../src/drive-causes.js';

const at = (s) => new Date(`${s}+00:00`);
const stateWith = (cause) => ({ driveCauses: { curiosity: cause } });

test('memory 来由：3 小时内第一次带原文+日期，之后只说被旧事勾起', () => {
  const now = at('2026-01-01T12:00:00');
  const st = stateWith({ kind: 'memory', id: 'm1', at: at('2026-01-01T10:00:00').toISOString(), text: '上次一起看的那场雨', date: '01/01' });
  const seen = new Set();
  const first = driveCause(st, 'curiosity', '涨', now, seen, [...seen] && []);
  assert.match(first, /想起 01\/01：「上次一起看的那场雨/);
});

test('longing/interaction/feedback 各自的来由', () => {
  const now = at('2026-01-01T12:00:00');
  const longing = driveCause({ driveCauses: { monitor: { kind: 'longing', hours: 5, at: now.toISOString() } } }, 'monitor', '涨', now, null, []);
  assert.equal(longing, '她 5 小时没来');
  const fb = driveCause({ driveCauses: { social: { kind: 'feedback', up: true, at: now.toISOString() } } }, 'social', '涨', now, null, []);
  assert.equal(fb, '你自己觉得涨了');
});

test('没有记录时按涨落给默认来由；平稳不写', () => {
  const now = at('2026-01-01T12:00:00');
  assert.equal(driveCause({ driveCauses: {} }, 'boredom', '涨', now, null, []), '没被满足，自己慢慢涨');
  assert.equal(driveCause({ driveCauses: {} }, 'boredom', '平', now, null, []), '');
});

test('noDecimal：小数读成「点」、驱力键名抹掉', () => {
  assert.equal(noDecimal('4.4 分 possess'), '4点4 分 ');
});
