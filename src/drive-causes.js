// 驱力来由（Drive Causes）：给「当前驱力」每一股配一句简短的来由，说明它为什么在这个水平。
// 来由由 engine.js 的 noteDriveCause 记在 state.driveCauses[key] 里；context-envelope 和驱力提示读它。
//
// 来由的几种来源（kind）：
//   memory   —— 被一段记忆勾起。记忆文本/日期由宿主的记忆系统喂进来（本引擎不自带长期记忆）：
//               浮现后 3 小时内、同一条第一次出现时带原文一两句 + 日期（调用方传 memorySeen 已出集合才带原文），之后只说「被一段旧事勾起」。
//   longing  —— 用户多久没来；interaction —— 刚才那次互动的类型；relief/satisfied —— 刚被满足或缓解；
//   feedback —— 由 /v1/drive-feedback 显式报的涨/落；都没有时按涨落给「没被满足，自己慢慢涨」「慢慢回落」。平稳的不写。
// 互动类型 → 来由里怎么说（INTERACTION_EFFECTS 的键；宿主加了新类型可以在这里补一句，没补的说「那一下」）
const CAUSE_TYPE = { companionship: '陪着', affection: '被哄', intimacy: '亲近', sharing: '她分享', discovery: '发现新东西', task_progress: '做成了事', reflection: '想事情', conflict: '吵架', loss: '失落', reconciliation: '和好' };
export const noDecimal = (t) => String(t ?? '').replace(/(\d)\.(\d)/g, '$1点$2').replace(/possess|monitor|crave|libido/gi, '');
export function driveCause(state, key, lv, now, memorySeen, used, { short = false } = {}) {
  const c = state.driveCauses?.[key];
  const ageH = (now.getTime() - (Date.parse(c?.at ?? '') || 0)) / 3_600_000;
  if (c?.kind === 'memory' && ageH < 3) {
    const k = `${key}|${c.id}|${c.at}`;
    if (!short && memorySeen && !memorySeen.has(k)) {
      used.push(k);
      const body = noDecimal(c.text).slice(0, 48);
      return `想起${c.date ? ` ${noDecimal(c.date)}` : '一件事'}：「${body}${c.text.length > 48 ? '…' : ''}」`;
    }
    return '被一段旧事勾起';
  }
  if (c?.kind === 'longing' && ageH < 3) return `她 ${c.hours} 小时没来`;
  if (c?.kind === 'interaction' && ageH < 6) return `刚才${CAUSE_TYPE[c.type] || '那一下'}`;   // 只说互动类型：细项有的本来就不显示（如分享欲的「想帮忙」）
  if (c?.kind === 'relief' && ageH < 6) return `${CAUSE_TYPE[c.type] || '她来过'}之后缓了些`;
  if (c?.kind === 'satisfied' && ageH < 6) return '刚被满足';
  if (c?.kind === 'feedback' && ageH < 3) return c.up ? '你自己觉得涨了' : '你自己觉得落了';
  if (lv === '涌' || lv === '涨') return '没被满足，自己慢慢涨';
  if (lv === '落') return '慢慢回落';
  return '';
}

