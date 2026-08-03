import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';


function config(overrides = {}) {
  return {
    serviceToken: 'service-secret',
    ombre: {
      url: '',
      token: '',
      readEnabled: false,
      writeEnabled: false,
      ...(overrides.ombre || {}),
    },
    context: {
      ombreEnabled: false,
      ...(overrides.context || {}),
    },
    dashboard: {
      enabled: false,
      accessToken: '',
      publicBaseUrl: 'https://xinchao.example.com',
      ...(overrides.dashboard || {}),
    },
  };
}


test('external memory remains optional when every integration is disabled', () => {
  const value = config();
  assert.equal(validateConfig(value), value);
});


for (const enabled of [
  { ombre: { readEnabled: true } },
  { ombre: { writeEnabled: true } },
  { context: { ombreEnabled: true } },
]) {
  test(`external memory requires URL and token: ${JSON.stringify(enabled)}`, () => {
    assert.throws(
      () => validateConfig(config(enabled)),
      /OMBRE_MCP_URL is required/
    );
    assert.throws(
      () => validateConfig(config({
        ...enabled,
        ombre: {
          ...(enabled.ombre || {}),
          url: 'https://memory.example.com/mcp',
        },
      })),
      /OMBRE_MCP_TOKEN is required/
    );
  });
}


test('authenticated external memory configuration is accepted', () => {
  const value = config({
    ombre: {
      url: 'https://memory.example.com/mcp',
      token: 'server-side-bearer',
      readEnabled: true,
    },
  });
  assert.equal(validateConfig(value), value);
});

test('Dashboard requires a separate strong access token', () => {
  assert.throws(
    () => validateConfig(config({ dashboard: { enabled: true, accessToken: 'short' } })),
    /at least 32 characters/,
  );
  assert.throws(
    () => validateConfig(config({ dashboard: { enabled: true, accessToken: 'service-secret' } })),
    /at least 32 characters/,
  );
  const shared = 'a'.repeat(32);
  const sameSecret = config({ dashboard: { enabled: true, accessToken: shared } });
  sameSecret.serviceToken = shared;
  assert.throws(() => validateConfig(sameSecret), /different from SERVICE_TOKEN/);
  assert.equal(
    validateConfig(config({ dashboard: { enabled: true, accessToken: 'd'.repeat(32) } })).dashboard.enabled,
    true,
  );
});

test('public Dashboard requires an HTTPS base URL', () => {
  const accessToken = 'd'.repeat(32);
  assert.throws(
    () => validateConfig(config({
      dashboard: { enabled: true, accessToken, publicBaseUrl: '' },
    })),
    /DASHBOARD_PUBLIC_BASE_URL is required/,
  );
  assert.throws(
    () => validateConfig(config({
      dashboard: { enabled: true, accessToken, publicBaseUrl: 'http://public.example.com' },
    })),
    /must use HTTPS/,
  );
  assert.equal(
    validateConfig(config({
      dashboard: { enabled: true, accessToken, publicBaseUrl: 'http://127.0.0.1:18110' },
    })).dashboard.enabled,
    true,
  );
});
