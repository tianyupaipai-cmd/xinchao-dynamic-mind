import { DIMENSIONS, DRIVE_KEYS, SATURATE_CEIL, SATURATE_FLOOR } from './dimensions.js';
import { newThoughtPool, tickThoughtPool, addFlashThought, obsessionBonus } from './thought-pool.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const iso = (value) => new Date(value).toISOString();

export function newState(now = new Date()) {
  const at = iso(now);
  return {
    schemaVersion: 4,
    revision: 0,
    consciousness: 'awake',
    lastConversationAt: at,
    lastHeartbeatAt: null,
    lastSettledAt: at,
    sleepStartedAt: null,
    drives: Object.fromEntries(DRIVE_KEYS.map((key) => [key, 0.15])),
    thoughtPool: newThoughtPool(),
    fatigue: 0,
    recentDreams: [],
    dreamUsage: {},
    lastBarkAt: null,
    lastDreamBarkAt: null,
    lastAutonomousBarkAt: null,
    barkUsage: {},
    recentBarkMessages: [],
    lastDreamPushMessage: null,
    lastAutonomousMessage: null,
    lastDaytimeEmergenceAt: null,
    nextDaytimeEmergenceAt: null,
    daytimeEmergenceUsage: {},
    pendingAwareness: null,
  };
}

// ── Bark dedup utilities ──────────────────────────────────────────

function normalizeBarkMessage(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function characterNgrams(value, size = 2) {
  const chars = Array.from(value);
  if (chars.length < size) return chars.length ? [chars.join('')] : [];
  return Array.from({ length: chars.length - size + 1 }, (_, index) => chars.slice(index, index + size).join(''));
}

export function barkMessageSimilarity(left, right) {
  const a = normalizeBarkMessage(left);
  const b = normalizeBarkMessage(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aGrams = characterNgrams(a);
  const bGrams = characterNgrams(b);
  const remaining = new Map();
  for (const gram of aGrams) remaining.set(gram, Number(remaining.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of bGrams) {
    const count = Number(remaining.get(gram) ?? 0);
    if (count > 0) {
      overlap += 1;
      remaining.set(gram, count - 1);
    }
  }
  const dice = (2 * overlap) / (aGrams.length + bGrams.length);
  const containment = overlap / Math.min(aGrams.length, bGrams.length);
  return Number(Math.max(dice, containment * 0.9).toFixed(4));
}

export function recentBarkHistory(state, limit = 8) {
  const current = Array.isArray(state.recentBarkMessages) ? state.recentBarkMessages : [];
  if (current.length) return current.slice(-limit);
  return [
    { at: state.lastDreamBarkAt, kind: 'dream', message: state.lastDreamPushMessage },
    { at: state.lastAutonomousBarkAt, kind: 'autonomous_thought', message: state.lastAutonomousMessage },
    { at: state.lastDaytimeEmergenceAt, kind: 'daytime_emergence', message: state.lastDaytimeMessage },
  ]
    .filter((item) => item.at && item.message)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .slice(-limit);
}

export function barkDuplicateCheck(message, state, threshold = 0.55) {
  const scores = recentBarkHistory(state).map((item) => barkMessageSimilarity(message, item.message));
  const similarity = scores.length ? Math.max(...scores) : 0;
  return { duplicate: similarity >= threshold, similarity };
}

function appendRecentBark(state, at, kind, message) {
  if (!message) return;
  state.recentBarkMessages = [
    ...recentBarkHistory(state),
    { at, kind, message },
  ].slice(-8);
  state.schemaVersion = Math.max(4, Number(state.schemaVersion) || 0);
}

// ── Time helpers ──────────────────────────────────────────────────

export function localDayAndHour(now, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

// ── Settle (the heartbeat tick) ───────────────────────────────────

export function settleState(input, now = new Date(), sleepAfterMinutes = 90, options = {}) {
  const state = structuredClone(input);
  const nowMs = now.getTime();
  const elapsedHours = Math.max(0, (nowMs - Date.parse(state.lastSettledAt)) / 3_600_000);
  let changed = elapsedHours > 0;

  const timeZone = options.timeZone ?? 'Asia/Shanghai';
  const { hour } = localDayAndHour(now, timeZone);

  const dawnStart = options.dawnFreezeStart ?? 1;
  const dawnEnd   = options.dawnFreezeEnd   ?? 8;
  const isDawn    = hour >= dawnStart && hour < dawnEnd;
  const isNight   = hour >= 22 || hour < 6;

  const fatigueMultiplier = 1 - clamp(Number(state.fatigue ?? 0), 0, 0.3);

  for (const key of DRIVE_KEYS) {
    const dim = DIMENSIONS[key];
    const current = Number(state.drives[key] ?? 0);

    if (isDawn && dim.dawnFreeze) {
      if (current !== Number(current.toFixed(4))) changed = true;
      state.drives[key] = Number(current.toFixed(4));
      continue;
    }

    let next;
    if (current >= SATURATE_CEIL) {
      const decay = (current - SATURATE_FLOOR) * 0.10 * elapsedHours;
      next = clamp(Math.max(SATURATE_FLOOR, current - decay));
    } else {
      let rate = dim.growPerHour;
      if (isNight && dim.nightMul !== undefined) rate *= dim.nightMul;
      rate *= fatigueMultiplier;
      next = Math.min(clamp(current + rate * elapsedHours), SATURATE_CEIL);
    }

    if (next !== current) changed = true;
    state.drives[key] = Number(next.toFixed(4));
  }

  // Tick thought pool
  state.thoughtPool ??= newThoughtPool();
  const feedbacks = tickThoughtPool(state.thoughtPool);
  for (const [key, amount] of Object.entries(feedbacks)) {
    if (DRIVE_KEYS.includes(key)) {
      const before = Number(state.drives[key]);
      state.drives[key] = Number(clamp(before + amount).toFixed(4));
      if (state.drives[key] !== before) changed = true;
    }
  }

  // Fatigue: slowly recovers during sleep, slowly builds during prolonged high-drive wakefulness
  if (state.consciousness === 'sleeping') {
    state.fatigue = Number(clamp(Number(state.fatigue ?? 0) - 0.02 * elapsedHours, 0, 0.3).toFixed(4));
  } else {
    const avgDrive = DRIVE_KEYS.reduce((sum, k) => sum + Number(state.drives[k]), 0) / DRIVE_KEYS.length;
    if (avgDrive > 0.5) {
      state.fatigue = Number(clamp(Number(state.fatigue ?? 0) + 0.005 * elapsedHours, 0, 0.3).toFixed(4));
    }
  }

  // Sleep transition
  const idleMinutes = Math.max(0, (nowMs - Date.parse(state.lastConversationAt)) / 60_000);
  if (idleMinutes >= sleepAfterMinutes && state.consciousness !== 'sleeping') {
    state.consciousness = 'sleeping';
    state.sleepStartedAt = iso(now);
    changed = true;
  }

  state.lastSettledAt = iso(now);
  if (changed) state.revision += 1;
  return { state, changed, elapsedHours, idleMinutes };
}

// ── Conversation event (wake up / interact) ───────────────────────

export function applyConversationEvent(input, event = {}, now = new Date()) {
  const state = structuredClone(input);
  const wasSleeping = state.consciousness === 'sleeping';
  state.consciousness = 'awake';
  state.lastConversationAt = iso(now);
  state.lastSettledAt = iso(now);
  state.sleepStartedAt = null;
  state.thoughtPool ??= newThoughtPool();

  if (wasSleeping) {
    const latest = state.recentDreams.at(-1);
    const belongsToThisSleep = latest && input.sleepStartedAt && Date.parse(latest.createdAt) >= Date.parse(input.sleepStartedAt);
    state.pendingAwareness = {
      createdAt: iso(now),
      dreamId: belongsToThisSleep ? latest.id : null,
      residue: belongsToThisSleep ? latest.residue : null,
      note: '外部记忆源只提供材料，不代表意识状态发生变化。',
    };
  }

  // Additive deltas (backward-compatible)
  for (const [key, delta] of Object.entries(event.driveDeltas ?? {})) {
    if (DRIVE_KEYS.includes(key) && Number.isFinite(Number(delta))) {
      state.drives[key] = Number(clamp(Number(state.drives[key]) + Number(delta)).toFixed(4));
    }
  }

  // Multiplicative satisfy
  for (const key of event.satisfiedDrives ?? []) {
    if (!DRIVE_KEYS.includes(key)) continue;
    const dim = DIMENSIONS[key];
    state.drives[key] = Number(clamp(Number(state.drives[key]) * (dim.satisfyMul ?? 0.40)).toFixed(4));

    // Cross-inhibition: satisfying key X reduces drives that list X in inhibitedBy
    for (const otherKey of DRIVE_KEYS) {
      const other = DIMENSIONS[otherKey];
      if (other.inhibitedBy?.[key] !== undefined) {
        state.drives[otherKey] = Number(clamp(Number(state.drives[otherKey]) * other.inhibitedBy[key]).toFixed(4));
      }
    }
  }

  // Flash thoughts from significant events
  for (const thought of event.flashThoughts ?? []) {
    if (DRIVE_KEYS.includes(thought.key)) {
      addFlashThought(state.thoughtPool, thought.key, thought.text ?? '', thought.intensity ?? 0.70);
    }
  }

  state.revision += 1;
  return { state, changed: true, wasSleeping };
}

// ── pickIntent (weighted random from tied pool) ───────────────────

export function pickIntent(state, random = Math.random) {
  const entries = Object.entries(state.drives)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  if (!entries.length) return null;

  const maxVal = Number(entries[0][1]);
  const tied = entries.filter(([, v]) => maxVal - Number(v) <= 0.12);

  if (tied.length === 1) {
    return { key: tied[0][0], value: Number(tied[0][1]), label: DIMENSIONS[tied[0][0]].label };
  }

  const pool = state.thoughtPool ?? newThoughtPool();
  const weights = tied.map(([key, value]) => ({
    key,
    value: Number(value),
    weight: Number(value) + obsessionBonus(pool, key),
  }));

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = random() * totalWeight;

  for (const w of weights) {
    roll -= w.weight;
    if (roll <= 0) return { key: w.key, value: w.value, label: DIMENSIONS[w.key].label };
  }

  return { key: weights[0].key, value: weights[0].value, label: DIMENSIONS[weights[0].key].label };
}

// ── Heartbeat / idle ──────────────────────────────────────────────

export function applyMemoryHeartbeat(input, now = new Date()) {
  const result = applyConversationEvent(input, {}, now);
  result.state.lastHeartbeatAt = iso(now);
  return result;
}

export function contactIdleAllowed(state, now, minIdleHours) {
  if (!state.lastHeartbeatAt) return false;
  const lastHeartbeatMs = Date.parse(state.lastHeartbeatAt);
  return Number.isFinite(lastHeartbeatMs)
    && now.getTime() - lastHeartbeatMs >= minIdleHours * 3_600_000;
}

// ── Drive feedback ────────────────────────────────────────────────

export function applyDriveFeedback(input, feedback = {}, now = new Date()) {
  const state = structuredClone(input);
  for (const [key, delta] of Object.entries(feedback)) {
    if (DRIVE_KEYS.includes(key) && Number.isFinite(Number(delta))) {
      state.drives[key] = Number(clamp(Number(state.drives[key]) + Number(delta)).toFixed(4));
    }
  }
  state.lastSettledAt = iso(now);
  state.revision += 1;
  return state;
}

// ── Top drives ────────────────────────────────────────────────────

export function topDrives(state, limit = 5) {
  return Object.entries(state.drives)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, label: DIMENSIONS[key].label, value }));
}

// ── Dream management ──────────────────────────────────────────────

export function recordDream(input, dream) {
  const state = structuredClone(input);
  state.recentDreams.push(dream);
  state.recentDreams = state.recentDreams.slice(-20);
  const day = dream.createdAt.slice(0, 10);
  state.dreamUsage[day] = Number(state.dreamUsage[day] ?? 0) + 1;
  state.revision += 1;
  return state;
}

function compactDreamText(value, maxChars = 280) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function breathDreamContext(input, now = new Date(), maxAgeHours = 18, maxDreams = 3) {
  const cutoff = now.getTime() - Math.max(1, Number(maxAgeHours) || 18) * 3_600_000;
  const limit = Math.max(1, Math.min(3, Number(maxDreams) || 3));
  const dreams = (input.recentDreams ?? [])
    .filter((dream) => {
      const createdAt = Date.parse(dream.createdAt ?? '');
      return Number.isFinite(createdAt) && createdAt >= cutoff && createdAt <= now.getTime();
    })
    .slice(-limit)
    .map((dream) => ({
      id: dream.id,
      createdAt: dream.createdAt,
      summary: compactDreamText(dream.awareness || dream.residue),
      residue: compactDreamText(dream.residue),
    }))
    .filter((dream) => dream.summary || dream.residue);
  return { version: 1, available: dreams.length > 0, dreams };
}

// ── Bark management ───────────────────────────────────────────────

export function recordBark(input, now = new Date(), details = {}) {
  const state = structuredClone(input);
  const at = iso(now);
  const day = at.slice(0, 10);
  appendRecentBark(state, at, details.kind ?? 'unknown', details.message);
  state.lastBarkAt = at;
  state.barkUsage ??= {};
  state.barkUsage[day] = Number(state.barkUsage[day] ?? 0) + 1;
  if (details.kind === 'dream') state.lastDreamBarkAt = at;
  if (details.kind === 'autonomous_thought') state.lastAutonomousBarkAt = at;
  if (details.kind === 'dream') state.lastDreamPushMessage = details.message ?? null;
  if (details.kind === 'autonomous_thought') state.lastAutonomousMessage = details.message ?? null;
  state.revision += 1;
  return state;
}

// ── Daytime emergence ─────────────────────────────────────────────

export function daytimeEmergenceAllowed(state, now, options) {
  const { day, hour } = localDayAndHour(now, options.timeZone);
  if (hour < options.startHour || hour >= options.endHour) return false;
  if (Number(state.daytimeEmergenceUsage?.[day] ?? 0) >= options.maxPerDay) return false;
  const dueAt = Date.parse(state.nextDaytimeEmergenceAt ?? '');
  return Number.isFinite(dueAt) && now.getTime() >= dueAt;
}

export function scheduleDaytimeEmergence(input, now = new Date(), minHours = 2, maxHours = 3, random = Math.random) {
  const state = structuredClone(input);
  const low = Math.min(minHours, maxHours);
  const high = Math.max(minHours, maxHours);
  const delayHours = low + clamp(Number(random()), 0, 1) * (high - low);
  state.nextDaytimeEmergenceAt = iso(new Date(now.getTime() + delayHours * 3_600_000));
  state.revision += 1;
  return state;
}

export function recordDaytimeEmergence(input, message, now = new Date(), timeZone = 'Asia/Shanghai') {
  const state = structuredClone(input);
  const at = iso(now);
  const { day } = localDayAndHour(now, timeZone);
  appendRecentBark(state, at, 'daytime_emergence', message);
  state.lastDaytimeEmergenceAt = at;
  state.lastDaytimeMessage = message;
  state.daytimeEmergenceUsage ??= {};
  state.daytimeEmergenceUsage[day] = Number(state.daytimeEmergenceUsage[day] ?? 0) + 1;
  state.revision += 1;
  return state;
}

// ── Bark gating ───────────────────────────────────────────────────

export function barkAllowed(state, now, minIntervalHours, maxPerDay, kind = null) {
  const day = iso(now).slice(0, 10);
  if (Number(state.barkUsage?.[day] ?? 0) >= maxPerDay) return false;
  const lastAt = kind === 'dream'
    ? state.lastDreamBarkAt
    : kind === 'autonomous_thought' ? state.lastAutonomousBarkAt : state.lastBarkAt;
  if (!lastAt) return true;
  return now.getTime() - Date.parse(lastAt) >= minIntervalHours * 3_600_000;
}

export function proactiveBarkAllowed(state, now, minIntervalHours, maxPerDay, minDrive) {
  if (state.consciousness !== 'sleeping') return false;
  const strongest = Math.max(...Object.values(state.drives).map(Number));
  return strongest >= minDrive && barkAllowed(state, now, minIntervalHours, maxPerDay, 'autonomous_thought');
}

export function dreamAllowed(state, now, minIntervalHours, maxPerDay) {
  if (state.consciousness !== 'sleeping') return false;
  const day = iso(now).slice(0, 10);
  if (Number(state.dreamUsage[day] ?? 0) >= maxPerDay) return false;
  const latest = state.recentDreams.at(-1);
  if (!latest) return true;
  return now.getTime() - Date.parse(latest.createdAt) >= minIntervalHours * 3_600_000;
}
