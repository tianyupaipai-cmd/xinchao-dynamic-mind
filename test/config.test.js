import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';


function config(overrides = {}) {
  return {
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
