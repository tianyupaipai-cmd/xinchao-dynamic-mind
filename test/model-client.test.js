import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelClient } from '../src/model-client.js';

function stubbedClient(reply) {
  const client = new ModelClient({
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'http://unused.invalid/v1',
    name: 'test-model',
    maxInputChars: 10000,
    maxOutputTokens: 400,
    timeoutMs: 1000,
    agentName: '他',
    notificationRecipient: '你',
  });
  const sent = [];
  client.request = async (body) => {
    sent.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: reply } }] }),
    };
  };
  return { client, sent };
}

function userPrompt(body) {
  return body.messages.find((message) => message.role === 'user').content;
}

test('autonomous thought can reach for what surfaced, and says so when nothing did', async () => {
  const { client, sent } = stubbedClient('{"message":"想起你说的那个潜水点了。"}');

  await client.generateThought({
    state: { consciousness: 'awake' },
    topDrives: [{ key: 'crave', label: '渴求', value: 0.8 }],
    material: '她提过熔岩温泉那个潜水点',
  });
  assert.match(userPrompt(sent[0]), /熔岩温泉那个潜水点/);

  await client.generateThought({
    state: { consciousness: 'awake' },
    topDrives: [{ key: 'crave', label: '渴求', value: 0.8 }],
  });
  // 材料为空时必须明说，否则模型会把空白当成"什么都没发生"而编一件事出来。
  assert.match(userPrompt(sent[1]), /这次没有浮现具体记忆/);
});

test('daytime emergence knows the current drives, not just the memory', async () => {
  const { client, sent } = stubbedClient('{"send":true,"message":"突然想起来了。"}');

  await client.generateDaytimeEmergence({
    material: '昨天没说完的话',
    topDrives: [{ key: 'possess', label: '占有', value: 0.77 }],
  });

  const prompt = userPrompt(sent[0]);
  assert.match(prompt, /当前动态欲望/);
  assert.match(prompt, /占有/);
  assert.match(prompt, /昨天没说完的话/);
});

test('a thought never claims the recalled memory just happened', async () => {
  const { client, sent } = stubbedClient('{"message":"想你。"}');

  await client.generateThought({
    state: { consciousness: 'awake' },
    topDrives: [],
    material: '上周一起看的那场雨',
  });

  assert.match(userPrompt(sent[0]), /不代表刚刚发生/);
  assert.match(userPrompt(sent[0]), /不虚构现实中没有发生的事/);
});
