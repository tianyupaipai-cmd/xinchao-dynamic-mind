import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardAuth } from '../src/dashboard-auth.js';
import { loadConfig } from '../src/config.js';

function auth() {
  return new DashboardAuth({ enabled: true, accessToken: 'x'.repeat(40), ttlSeconds: 3600 });
}

function requestWith(headers) {
  return { headers };
}

test('the same session token works over the header channel', () => {
  const dashboard = auth();
  const { token } = dashboard.createSession();

  assert.equal(dashboard.validateRequest(requestWith({ authorization: `Bearer ${token}` })), true);
  // Cookie 通道不受影响。
  assert.equal(dashboard.validateRequest(requestWith({ cookie: `xinchao_dashboard=${token}` })), true);
});

test('the header channel rejects anything that is not a live session', () => {
  const dashboard = auth();
  dashboard.createSession();

  assert.equal(dashboard.validateRequest(requestWith({ authorization: 'Bearer not-a-session' })), false);
  // 直连不该让人拿 Dashboard 口令本身当会话用 —— 口令只能换 token。
  assert.equal(dashboard.validateRequest(requestWith({ authorization: `Bearer ${'x'.repeat(40)}` })), false);
  assert.equal(dashboard.validateRequest(requestWith({})), false);
});

test('logout kills the session no matter which channel it arrived on', () => {
  const dashboard = auth();
  const { token } = dashboard.createSession();

  dashboard.destroyRequestSession(requestWith({ authorization: `Bearer ${token}` }));
  assert.equal(dashboard.validateRequest(requestWith({ authorization: `Bearer ${token}` })), false);
});

test('an expired session is not revived by using the header instead', () => {
  const dashboard = auth();
  const { token } = dashboard.createSession(new Date(0));
  const wayLater = new Date(3600_001 * 2);

  assert.equal(dashboard.validateRequest(requestWith({ authorization: `Bearer ${token}` }), wayLater), false);
});

test('cross-origin access is closed unless the operator opens it', () => {
  const previous = process.env.DASHBOARD_ALLOWED_ORIGINS;
  try {
    delete process.env.DASHBOARD_ALLOWED_ORIGINS;
    assert.deepEqual(loadConfig().dashboard.allowedOrigins, []);

    process.env.DASHBOARD_ALLOWED_ORIGINS = 'https://xinchaomind.uk/, https://test.xinchaomind.uk';
    const opened = loadConfig().dashboard.allowedOrigins;
    // 尾斜杠要归一，否则浏览器发来的 Origin 永远匹配不上。
    assert.deepEqual(opened, ['https://xinchaomind.uk', 'https://test.xinchaomind.uk']);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_ALLOWED_ORIGINS;
    else process.env.DASHBOARD_ALLOWED_ORIGINS = previous;
  }
});
