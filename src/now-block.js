// 「此刻」块：每轮对话前挂给 AI 的几行心潮状态（GET /v1/now）。比 Context Envelope 短得多，给词不给数。
//
//   【心潮·此刻】
//   驱力：好奇（涌；没被满足，自己慢慢涨）、想她（涨；刚才陪着）
//   情绪：平静偏暖，松，好奇在动；刚才陪着；近一天走过 低落→平静
//   身体：心跳 72，呼吸平稳，体温正常
//   （外接的行，见 now-lines.js）
//   念头：有个关于「好奇」的念头一直在绕
//   另外：昨夜有梦。细的在 xinchao_context
//
// 兜底：状态太旧（3 小时没结算）、驱力越界或全卡在同一个高值、块超长或混进小数/驱力 key，就整块不给——
// 宁可这一轮没有此刻，也不灌一段错的。块满了先让外接的行，再让身体那行，再把驱力来由缩短、去掉。
// 返回 digest 给钩子判断「此刻变没变」：心跳数每轮都在动，只按档（偏慢/平稳/偏快/很快）算。

import { createHash } from 'node:crypto';
import { DRIVE_KEYS, DRIVE_SHORT, driveLevel } from './dimensions.js';
import { driveCause } from './drive-causes.js';
import { breathDreamContext, driveTrend, shownDrives } from './engine.js';
import { emotionNuance, emotionSummary } from './emotion.js';
import { heartLabel } from './pulse.js';

const NOW_STALE_MS = 3 * 3_600_000;
export const NOW_MAX_LINES = 8;
export const NOW_MAX_CHARS = 400;
const CAUSE_LABEL = {
  companionship: '陪着', affection: '被安抚', intimacy: '亲近过', sharing: '分享过', discovery: '发现了什么',
  task_progress: '推进了事', reflection: '沉淀过', conflict: '争执', loss: '失落', reconciliation: '和好',
};

export function nowSanity(state, now = new Date()) {
  const settledAt = Date.parse(state?.lastSettledAt ?? '');
  if (!Number.isFinite(settledAt)) return { ok: false, reason: 'no_settle' };
  if (now.getTime() - settledAt > NOW_STALE_MS) return { ok: false, reason: 'stale_state' };
  const values = DRIVE_KEYS.map((key) => Number(state?.drives?.[key]));
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return { ok: false, reason: 'drive_out_of_range' };
  if (values.every((v) => v >= 0.95)) return { ok: false, reason: 'drives_saturated' };
  // 全维一模一样且不低：新装的 0.15 初始态是正常的，卡在同一个高值才是算坏了
  if (new Set(values.map((v) => v.toFixed(3))).size === 1 && values[0] >= 0.5) return { ok: false, reason: 'drives_flat' };
  const e = state?.emotion ?? {};
  const emotionOk = Number.isFinite(Number(e.valence)) && Number.isFinite(Number(e.arousal)) && e.valence >= 0 && e.valence <= 1 && e.arousal >= 0 && e.arousal <= 1;
  return { ok: true, emotionOk };
}

export function buildNowCompact(state, now = new Date(), { body = '', extra = [], memoryCauses = null } = {}) {
  const fail = (reason, lines = 0) => ({ ok: false, reason, text: '', lines, digest: '', revision: Number(state?.revision ?? 0), generatedAt: now.toISOString() });
  const sanity = nowSanity(state, now);
  if (!sanity.ok) return fail(sanity.reason);
  const lines = ['【心潮·此刻】'];
  if (state.consciousness === 'sleeping') lines.push('睡着（有人来了才算醒）');

  const drives = shownDrives(state, 3);   // 最高的三股 + 过线的难过/生气
  const memoryCauseKeys = [];
  const driveLineOf = (opts) => `驱力：${drives.map((d) => {
    const lv = driveLevel(d.key, Number(d.value), driveTrend(state, d.key, now));
    const why = opts === 'none' ? '' : driveCause(state, d.key, lv, now, memoryCauses, memoryCauseKeys, { short: opts === 'short' });
    return `${DRIVE_SHORT[d.key] ?? d.label}（${lv}${why ? `；${why}` : ''}）`;
  }).join('、')}`;
  const driveLineFull = drives.length ? driveLineOf('full') : '';
  if (driveLineFull) lines.push(driveLineFull);

  if (sanity.emotionOk) {
    const emotion = emotionSummary(state, now);
    const causeAt = Date.parse(emotion.lastCauseAt ?? '');
    const cause = emotion.lastCause && causeAt >= now.getTime() - 6 * 3_600_000 ? (CAUSE_LABEL[emotion.lastCause] ?? emotion.lastCause) : '';
    // 近一天的情绪路径：去掉连着重复的，只留最后 5 步
    const path = (emotion.trend?.labels || []).filter((l, i, a) => i === 0 || l !== a[i - 1]);
    const trend = path.length >= 2 ? `；近一天走过 ${path.length > 5 ? '…' : ''}${path.slice(-5).join('→')}` : '';
    lines.push(`情绪：${emotionNuance(state, now)}${cause ? `；刚才${cause}` : ''}${trend}`);
  }
  if (body) lines.push(body);
  const outside = (Array.isArray(extra) ? extra : []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
  lines.push(...outside);

  const obsessions = (state.thoughtPool?.obsessions ?? []).filter((o) => Number(o.intensity) >= 0.5).slice(0, 2);
  if (obsessions.length) lines.push(`念头：${obsessions.map((o) => `有个关于「${DRIVE_SHORT[o.key] ?? o.key}」的念头一直在绕`).join('；')}`);
  const extras = [];
  if (breathDreamContext(state, now, 18, 1).available) extras.push('昨夜有梦');
  if (extras.length) lines.push(`另外：${extras.join('、')}。细的在 xinchao_context`);

  // 块满了：外接的行先让位，然后是身体那行，再把驱力来由缩短、去掉
  for (let i = outside.length - 1; i >= 0 && (lines.length > NOW_MAX_LINES || lines.join('\n').length > NOW_MAX_CHARS); i -= 1) lines.splice(lines.lastIndexOf(outside[i]), 1);
  if (body && lines.length > NOW_MAX_LINES) lines.splice(lines.indexOf(body), 1);
  if (driveLineFull && lines.join('\n').length > NOW_MAX_CHARS) { memoryCauseKeys.length = 0; lines[lines.indexOf(driveLineFull)] = driveLineOf('short'); }
  if (driveLineFull && lines.join('\n').length > NOW_MAX_CHARS) { const i = lines.findIndex((l) => l.startsWith('驱力：')); if (i >= 0) lines[i] = driveLineOf('none'); }
  const text = lines.join('\n');
  if (lines.length > NOW_MAX_LINES || text.length > NOW_MAX_CHARS || /\d\.\d|possess|monitor|crave|libido/.test(text)) return fail('render_guard', lines.length);
  const stable = text.replace(/心跳 (\d+)/g, (_, n) => `心跳${heartLabel(Number(n))}`);
  return { ok: true, text, lines: lines.length, memoryCauseKeys, digest: createHash('sha256').update(stable).digest('hex').slice(0, 16), revision: Number(state.revision ?? 0), generatedAt: now.toISOString() };
}
