import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkClient } from '../src/bark-client.js';

test('Bark preserves the configured agent identity settings', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };
  try {
    const client = new BarkClient({
      enabled: true,
      key: 'test-key',
      server: 'https://api.day.app',
      title: '心潮',
      group: 'xinchao',
      icon: 'https://example.com/avatar.png',
      sound: 'silence',
      level: 'timeSensitive'
    });
    const result = await client.send('测试余韵');
    assert.equal(result.sent, true);
    assert.equal(request.url, 'https://api.day.app/test-key');
    assert.deepEqual(JSON.parse(request.options.body), {
      title: '心潮',
      body: '测试余韵',
      group: 'xinchao',
      icon: 'https://example.com/avatar.png',
      sound: 'silence',
      level: 'timeSensitive'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
