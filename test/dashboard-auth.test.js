import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardAuth } from '../src/dashboard-auth.js';

function request(cookie = '') {
  return { headers: { cookie } };
}

test('dashboard exchanges a separate secret for an HttpOnly session', () => {
  const auth = new DashboardAuth({
    enabled: true,
    accessToken: 'dashboard-only-secret',
    ttlSeconds: 3600,
    secureCookies: true,
  });
  assert.equal(auth.verifyAccessToken('wrong', 'local'), false);
  assert.equal(auth.verifyAccessToken('dashboard-only-secret', 'local'), true);
  const session = auth.createSession(new Date('2026-08-03T08:00:00.000Z'));
  const cookie = auth.sessionCookie(session.token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(auth.validateRequest(request(cookie), new Date('2026-08-03T08:30:00.000Z')), true);
  auth.destroyRequestSession(request(cookie));
  assert.equal(auth.validateRequest(request(cookie), new Date('2026-08-03T08:30:00.000Z')), false);
});

test('dashboard login attempts are bounded', () => {
  const auth = new DashboardAuth({ enabled: true, accessToken: 'secret' });
  const now = new Date('2026-08-03T08:00:00.000Z');
  for (let index = 0; index < 8; index += 1) {
    auth.verifyAccessToken('wrong', 'remote', now);
  }
  assert.equal(auth.rateLimited('remote', now), true);
  assert.equal(auth.rateLimited('remote', new Date('2026-08-03T08:01:01.000Z')), false);
});
