import { randomUUID } from 'node:crypto';

export const WAKE_BRIDGE_KINDS = Object.freeze([
  'dream_residue',
  'longing_content',
  'action_result',
  'pending_from_me',
]);

export const WAKE_BRIDGE_AUDIENCES = Object.freeze(['user', 'ai', 'both']);

const FORBIDDEN_KEYS = /^(authorization|cookie|raw[_-]?(chat|prompt|conversation)|service[_-]?token|access[_-]?token)$/i;

function compact(value, maxLength) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function assertSafePayload(value, path = 'payload') {
  if (value == null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new Error(`${path}.${key} is not allowed in Wake Bridge envelopes`);
    assertSafePayload(item, `${path}.${key}`);
  }
}

function boundedJson(value, maxLength = 6000) {
  assertSafePayload(value);
  const serialized = JSON.stringify(value ?? {});
  if (serialized.length > maxLength) throw new Error(`Wake Bridge AI context exceeds ${maxLength} characters`);
  return JSON.parse(serialized);
}

export function createWakeBridgeEnvelope({
  kind,
  audience = 'both',
  humanMessage = '',
  aiContext = {},
  source = 'xinchao',
  dedupeKey = '',
  ttlHours = 72,
  now = new Date(),
} = {}) {
  if (!WAKE_BRIDGE_KINDS.includes(kind)) throw new Error(`unsupported Wake Bridge kind: ${kind}`);
  if (!WAKE_BRIDGE_AUDIENCES.includes(audience)) throw new Error(`unsupported Wake Bridge audience: ${audience}`);
  const createdAt = new Date(now);
  const safeMessage = compact(humanMessage, 1200);
  if ((audience === 'user' || audience === 'both') && !safeMessage) {
    throw new Error('humanMessage is required for user delivery');
  }
  const context = boundedJson(aiContext);
  return {
    protocol: 'xinchao-wake-bridge/1',
    id: randomUUID(),
    kind,
    audience,
    source: compact(source, 80) || 'xinchao',
    dedupeKey: compact(dedupeKey, 160) || null,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + Math.max(1, Math.min(720, Number(ttlHours) || 72)) * 3_600_000).toISOString(),
    status: 'pending',
    human: audience === 'ai' ? null : { message: safeMessage },
    ai: audience === 'user' ? null : { context },
    delivery: { deliveredAt: null, consumedAt: null },
  };
}

export function markWakeBridgeDelivered(input, now = new Date()) {
  const envelope = structuredClone(input);
  if (envelope.status === 'consumed') return envelope;
  envelope.status = 'delivered';
  envelope.delivery ??= {};
  envelope.delivery.deliveredAt ??= new Date(now).toISOString();
  envelope.delivery.consumedAt ??= null;
  return envelope;
}

export function consumeWakeBridgeEnvelope(input, now = new Date()) {
  const envelope = markWakeBridgeDelivered(input, now);
  envelope.status = 'consumed';
  envelope.delivery.consumedAt ??= new Date(now).toISOString();
  return envelope;
}
