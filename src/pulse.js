// 脉：一直在跑的身体——心跳、呼吸、体温。不表演，数是算出来的，怎么用由 AI 自己定。
// 借鉴：「脉 · Pulse」DankeCompanion 身体感知系统 v1 全链路教程，原作者 蛋（小红书号 844455787，X：kedaneggai）——
//       心率为核心驱动、体温呼吸是衍生、「不表演，数是算出来的」「生理数据是当下的，记忆是沉淀的」都出自那份教程；算法按心潮自己的状态重写。
//
// 心跳 = 底子（醒着 / 睡着）+ 情绪（唤醒高就快、难受也会快一点）+ 驱力（情欲、想她、生气、难过）
//        + 清早那一阵 + 宿主报来的临时偏移（POST /v1/body，比如运动、紧张、发烧）+ 一点自然抖动，夹在 48–160。
// 呼吸跟着心跳走（心跳 90 → 每分钟多 3 次），再看唤醒；给 AI 的是一句「呼吸平稳 / 偏浅 / 急促」这样的话。
// 体温 = 醒着 36.6 / 睡着 36.3 + 一天里的起落（傍晚 5 点最高、清早 5 点最低，±0.2）+ 心跳带的（每快 10 下 +0.1）
//        + 情欲、生气泛上来的一点热 + 宿主报的偏移 + 很小的抖动，夹在 35–41；给 AI 的也是一句话（体温正常 / 微热…）。
// 纯函数：同样的状态、同样的时间、同样的偏移，算出来一样。不进状态、不进记忆——身体是当下的，记忆是沉淀的。
// PULSE=false 关掉。

import { localDayAndHour } from './engine.js';

const HR_MIN = 48;
const HR_MAX = 160;
const BREATH_MIN = 8;
const BREATH_MAX = 35;
const TEMP_MIN = 35;
const TEMP_MAX = 41;
export const OFFSET_LIMITS = Object.freeze({ hr: [-40, 80], breath: [-10, 20], temp: [-1.5, 3], minutes: [1, 180] });

const n01 = (x) => { const v = Number(x); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 慢慢起伏的自然抖动（±3 以内），按时间算，不用随机数 */
function drift(ms) {
  const t = ms / 1000;
  return 1.8 * Math.sin(t / 97) + 1.2 * Math.sin(t / 41 + 1.3);
}

/** 还在有效期里的偏移加起来；过期的不算 */
export function sumOffsets(offsets = [], nowMs = Date.now()) {
  let hr = 0; let breath = 0; let temp = 0;
  for (const o of offsets) {
    if (!o || !(Number(o.until) > nowMs)) continue;
    hr += Number(o.hr) || 0;
    breath += Number(o.breath) || 0;
    temp += Number(o.temp) || 0;
  }
  return { hr: clamp(hr, ...OFFSET_LIMITS.hr), breath: clamp(breath, ...OFFSET_LIMITS.breath), temp: clamp(temp, ...OFFSET_LIMITS.temp) };
}

export function breathLabel(rate) {
  if (rate < 10) return '很深很长';
  if (rate < 13) return '深长';
  if (rate < 18) return '平稳';
  if (rate < 24) return '偏浅';
  return '急促';
}

export function tempLabel(t) {
  if (t < 36) return '偏凉';
  if (t < 37.1) return '正常';
  if (t < 37.6) return '微热';
  if (t < 38.5) return '发热';
  return '发烫';
}
export function heartLabel(hr) {
  if (hr < 60) return '偏慢';
  if (hr < 86) return '平稳';
  if (hr < 106) return '偏快';
  return '很快';
}

export function computeVitals(state, now = new Date(), { timeZone = 'Asia/Shanghai', offsets = [] } = {}) {
  const nowMs = now.getTime();
  const sleeping = state?.consciousness === 'sleeping';
  const d = state?.drives ?? {};
  const a = n01(state?.emotion?.arousal ?? 0.35);
  const v = n01(state?.emotion?.valence ?? 0.5);
  const { hour } = localDayAndHour(now, timeZone);
  const off = sumOffsets(offsets, nowMs);

  const base = sleeping ? 57 : 68;
  const emo = (a - 0.35) * (sleeping ? 12 : 28) + (v < 0.3 ? 4 : 0);
  const drive = 8 * n01(d.libido) + 3 * n01(d.possess) + 10 * n01(d.anger) + 3 * n01(d.grieve);
  const morning = !sleeping && hour >= 6 && hour < 9 ? 4 : 0;
  const hr = Math.round(clamp(base + emo + drive + morning + off.hr + drift(nowMs), HR_MIN, HR_MAX));

  const rateRaw = (sleeping ? 12 : 14) + (hr - 70) * 0.15 + (a - 0.35) * 4 + off.breath;
  const breath = Math.round(clamp(rateRaw, BREATH_MIN, BREATH_MAX));

  const day = 0.2 * Math.cos(((hour - 17) / 24) * Math.PI * 2);
  const flush = 0.2 * n01(d.libido) + 0.15 * n01(d.anger);
  const tempRaw = (sleeping ? 36.3 : 36.6) + day + (hr - 70) * 0.01 + flush + off.temp + 0.04 * Math.sin(nowMs / 1000 / 233);
  const temp = Math.round(clamp(tempRaw, TEMP_MIN, TEMP_MAX) * 10) / 10;
  return { hr, breath, temp, heart: heartLabel(hr), breathing: breathLabel(breath), temperature: tempLabel(temp), at: now.toISOString() };
}

/** 此刻块里那一行：心跳给整数，呼吸、体温给一句话（此刻块不许有小数，体温的数只走 /v1/body） */
export function bodyLine(vitals) {
  if (!vitals) return '';
  return `身体：心跳 ${vitals.hr}，呼吸${vitals.breathing}${vitals.temperature ? `，体温${vitals.temperature}` : ''}`;
}

/** 宿主报来的偏移（POST /v1/body）：校验、夹住范围；同一个 key 后报的覆盖先报的 */
export function normalizeOffset(payload = {}, nowMs = Date.now()) {
  const minutes = Number(payload.minutes);
  if (!Number.isFinite(minutes)) return { error: 'minutes 要给（1–180 分钟）' };
  const hr = Number(payload.hr ?? 0);
  const breath = Number(payload.breath ?? 0);
  const temp = Number(payload.temp ?? 0);
  if (!Number.isFinite(hr) || !Number.isFinite(breath) || !Number.isFinite(temp)) return { error: 'hr / breath / temp 要是数字' };
  const key = String(payload.key ?? payload.eventId ?? payload.event_id ?? '').trim().slice(0, 80);
  if (!key) return { error: '要给 key 或 eventId（同一个 key 后报的覆盖先报的）' };
  return {
    key,
    hr: clamp(hr, ...OFFSET_LIMITS.hr),
    breath: clamp(breath, ...OFFSET_LIMITS.breath),
    temp: clamp(temp, ...OFFSET_LIMITS.temp),
    until: nowMs + clamp(minutes, ...OFFSET_LIMITS.minutes) * 60_000,
  };
}
