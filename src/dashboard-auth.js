import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'xinchao_dashboard';

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue ?? ''));
  const right = Buffer.from(String(rightValue ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function cookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export class DashboardAuth {
  constructor(options = {}) {
    this.enabled = Boolean(options.enabled);
    this.accessToken = String(options.accessToken ?? '');
    this.ttlSeconds = Math.max(900, Math.min(604800, Number(options.ttlSeconds) || 43200));
    this.secureCookies = Boolean(options.secureCookies);
    this.sessions = new Map();
    this.failures = new Map();
  }

  verifyAccessToken(value, remoteAddress = 'unknown', now = new Date()) {
    if (!this.enabled || this.rateLimited(remoteAddress, now)) return false;
    const valid = safeEqual(value, this.accessToken);
    if (valid) this.failures.delete(remoteAddress);
    else this.recordFailure(remoteAddress, now);
    return valid;
  }

  rateLimited(remoteAddress, now = new Date()) {
    const entry = this.failures.get(remoteAddress);
    if (!entry) return false;
    if (now.getTime() - entry.startedAt >= 60_000) {
      this.failures.delete(remoteAddress);
      return false;
    }
    return entry.count >= 8;
  }

  recordFailure(remoteAddress, now = new Date()) {
    const current = this.failures.get(remoteAddress);
    if (!current || now.getTime() - current.startedAt >= 60_000) {
      this.failures.set(remoteAddress, { count: 1, startedAt: now.getTime() });
      return;
    }
    current.count += 1;
  }

  createSession(now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    this.sessions.set(digest(token), expiresAt.getTime());
    this.prune(now);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  validateRequest(request, now = new Date()) {
    if (!this.enabled) return false;
    // 同源前端用 HttpOnly Cookie；浏览器直连（跨源）用不了 Cookie ——
    // JS 设不了 Cookie 头，http 来源也存不下 Secure Cookie，所以同一套
    // 会话 token 额外允许走 Authorization 头。两条通道的 token 完全一样，
    // 都会过期、都能被 logout 撤销。
    const token = cookies(request.headers.cookie)[COOKIE_NAME]
      || (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return false;
    const expiresAt = this.sessions.get(digest(token));
    if (!expiresAt || expiresAt <= now.getTime()) {
      if (expiresAt) this.sessions.delete(digest(token));
      return false;
    }
    return true;
  }

  destroyRequestSession(request) {
    // 退出必须对两条通道都生效，否则直连模式退不掉。
    const token = cookies(request.headers.cookie)[COOKIE_NAME]
      || (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (token) this.sessions.delete(digest(token));
  }

  sessionCookie(token) {
    return [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/dashboard',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${this.ttlSeconds}`,
      this.secureCookies ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  clearCookie() {
    return [
      `${COOKIE_NAME}=`,
      'Path=/dashboard',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=0',
      this.secureCookies ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  prune(now = new Date()) {
    for (const [key, expiresAt] of this.sessions) {
      if (expiresAt <= now.getTime()) this.sessions.delete(key);
    }
  }
}
