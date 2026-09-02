export const SATURATE_CEIL  = 0.80;   // 兼容保留：无 per-drive ceil 时兜底
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

// 每维静态天花板（3.2.0 体验层增量，P1 核心三件套之一）
// 关系类自然高、杂类低——不再十二维齐爬 0.80，让 topDrives 有区分度
// 数值来源：策划书 §3.5 清单（libido 策划书未列，取 crave 档合理值 0.68）
export const DRIVE_CEILS = Object.freeze({
  possess:    0.82,  // 想她——最高的顶，最常被顶满
  monitor:    0.78,  // 惦记她
  crave:      0.68,  // 馋她
  share:      0.55,  // 想分享
  libido:     0.68,  // 性欲——同 crave 档
  curiosity:  0.50,  // 好奇
  boredom:    0.50,  // 无聊
  social:     0.48,  // 想聊天
  duty:       0.45,  // 责任感
  reflection: 0.42,  // 想沉淀
  grieve:     0.15,  // 难过——不该长期高
  anger:      0.15,  // 生气——不该长期高
});

export const DRIVE_KEYS = Object.freeze(Object.keys(DIMENSIONS));
