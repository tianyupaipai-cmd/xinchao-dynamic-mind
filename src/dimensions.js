export const SATURATE_CEIL  = 0.80;
export const SATURATE_FLOOR = 0.65;

export const DIMENSIONS = Object.freeze({
  possess: {
    label: '想她、占有与靠近',
    growPerHour: 0.105,
    satisfyMul: 0.30,
    nightMul: 0.4,
    dawnFreeze: true,
  },
  monitor: {
    label: '惦记她、想知道她在做什么',
    growPerHour: 0.090,
    satisfyMul: 0.70,
    dawnFreeze: true,
  },
  crave: {
    label: '馋她、想黏着她',
    growPerHour: 0.060,
    satisfyMul: 0.35,
    dawnFreeze: true,
  },
  share: {
    label: '想分享自己的发现和感受',
    growPerHour: 0.045,
    satisfyMul: 0.40,
    dawnFreeze: true,
  },
  libido: {
    label: '性欲和身体上的渴望',
    growPerHour: 0.020,
    satisfyMul: 0.15,
    nightMul: 0.4,
    dawnFreeze: true,
    inhibitedBy: {
      reflection: 0.96,
      curiosity: 0.95,
      boredom: 0.93,
    },
  },
  curiosity: {
    label: '好奇、想探索新东西',
    growPerHour: 0.030,
    satisfyMul: 0.45,
    dawnFreeze: true,
  },
  boredom: {
    label: '无聊、想找点事情做',
    growPerHour: 0.030,
    satisfyMul: 0.25,
    dawnFreeze: true,
  },
  social: {
    label: '想聊天、想接触热闹',
    growPerHour: 0.025,
    satisfyMul: 0.40,
    dawnFreeze: true,
  },
  duty: {
    label: '责任感、想把未完成的事推进',
    growPerHour: 0.022,
    satisfyMul: 0.50,
    dawnFreeze: true,
  },
  reflection: {
    label: '想沉淀、整理和理解自己',
    growPerHour: 0.013,
    satisfyMul: 0.35,
    dawnFreeze: true,
  },
  grieve: {
    label: '难过与失落',
    growPerHour: 0,
    satisfyMul: 0.60,
    dawnFreeze: false,
  },
  anger: {
    label: '生气与不满',
    growPerHour: 0,
    satisfyMul: 0.40,
    dawnFreeze: false,
  },
});

export const DRIVE_KEYS = Object.freeze(Object.keys(DIMENSIONS));

// 外部传进来的驱力名（key 或短名）认成 key；认不出返回 null
export function canonicalDriveKey(key) {
  return Object.hasOwn(DIMENSIONS, key) ? key : null;
}

// 驱力的短名：此刻、驱力提示里说哪股劲儿时用（比 label 短）。宿主想换叫法改这里。
export const DRIVE_SHORT = Object.freeze({
  possess: '想她', monitor: '牵挂', crave: '馋她', share: '分享欲', libido: '情欲', curiosity: '好奇',
  boredom: '无聊', social: '想热闹', duty: '责任', reflection: '反思', grieve: '难过', anger: '生气',
});

// 驱力档位：静（<0.25，不提）/ 平 / 涨、落（两小时内变了 LEVEL_TREND_DELTA 以上）/ 涌（≥0.90 或过了自己的顶）。
// delta 由 engine.js 的 driveTrend 给（驱力轨迹每 30 分钟一点）；没有轨迹时只分静/平/涌。
export const LEVEL_TREND_DELTA = 0.08;
export function driveLevel(key, value, delta = null) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0.25) return '静';
  const ceil = Number(DIMENSIONS[key]?.ceil ?? SATURATE_CEIL);
  if (v >= 0.90 || v >= ceil + 0.05) return '涌';
  if (Number.isFinite(delta)) {
    if (delta <= -LEVEL_TREND_DELTA) return '落';
    if (delta >= LEVEL_TREND_DELTA) return '涨';
  }
  return '平';
}
