import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpMessage } from '../src/mcp-protocol.js';

function handlers() {
  return {
    defaultSessionId: 'transport-session-1',
    context: async (args) => ({
      version: 1,
      delivered: true,
      additionalContext: `[心潮动态状态]\nsession=${args.sessionId}`,
      sessionId: args.sessionId,
      mode: args.mode,
      maxTokens: args.maxTokens,
      estimatedTokens: 20,
      sections: [],
      digest: 'abc',
    }),
    event: async (event) => ({
      revision: 8,
      consciousness: 'awake',
      sessionId: event.sessionId,
      sessionCreated: true,
      received: event,
    }),
    handoffNote: async (note) => ({
      revision: 9,
      duplicate: false,
      received: note,
    }),
  };
}

test('MCP initialize advertises the 2.3.1 tool server', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  }, handlers());
  assert.equal(result.status, 200);
  assert.equal(result.body.result.protocolVersion, '2025-06-18');
  assert.equal(result.body.result.serverInfo.name, 'xinchao-dynamic-mind');
  assert.equal(result.body.result.serverInfo.version, '2.3.1');
  assert.equal(result.body.result.capabilities.tools.listChanged, false);
});

test('tools/list exposes context, event and short handoff note tools', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  }, handlers());
  assert.deepEqual(
    result.body.result.tools.map((tool) => tool.name),
    ['xinchao_context', 'xinchao_event', 'xinchao_handoff_note'],
  );
  assert.equal(result.body.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(result.body.result.tools[1].annotations.destructiveHint, false);
  assert.equal(result.body.result.tools[1].annotations.idempotentHint, true);
  assert.deepEqual(result.body.result.tools[0].inputSchema.required, undefined);
  assert.equal(result.body.result.tools[0].inputSchema.properties.max_tokens.default, 2200);
  assert.ok(result.body.result.tools[1].inputSchema.required.includes('event_id'));
  assert.equal(result.body.result.tools[1].inputSchema.required.includes('session_id'), false);
  assert.ok(result.body.result.tools[1].inputSchema.properties.interaction_type.enum.includes('sharing'));
  assert.equal(result.body.result.tools[2].annotations.idempotentHint, true);
  assert.deepEqual(
    result.body.result.tools[2].inputSchema.required,
    ['event_id', 'note'],
  );
});

test('xinchao_context returns injectable text and structured envelope', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'xinchao_context',
      arguments: {
        session_id: 'claude-mac-1',
        mode: 'session_start',
        max_tokens: 500,
      },
    },
  }, handlers());
  assert.equal(result.body.result.isError, false);
  assert.match(result.body.result.content[0].text, /claude-mac-1/);
  assert.equal(result.body.result.structuredContent.sessionId, 'claude-mac-1');
});

test('xinchao_event drops chat plaintext and keeps only allowed short-state fields', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'xinchao_event',
      arguments: {
        session_id: 'codex-mac-1',
        event_id: 'event-1',
        interaction_type: 'sharing',
        tone: 'focused',
        attention: 0.9,
        message: '这段聊天正文绝不能进入状态',
        driveDeltas: { curiosity: 1 },
      },
    },
  }, handlers());
  const received = result.body.result.structuredContent.received;
  assert.equal(received.sessionId, 'codex-mac-1');
  assert.equal(received.sessionState.tone, 'focused');
  assert.equal(received.sessionState.attention, 0.9);
  assert.equal(received.interactionType, 'sharing');
  assert.equal('message' in received, false);
  assert.equal('driveDeltas' in received, false);
  assert.doesNotMatch(JSON.stringify(received), /聊天正文/);
});

test('xinchao_event requires an opaque event id for idempotent settlement', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'xinchao_event',
      arguments: {
        session_id: 'claude-window',
        interaction_type: 'companionship',
      },
    },
  }, handlers());
  assert.equal(result.body.result.isError, true);
  assert.match(result.body.result.content[0].text, /event_id/);
});

test('xinchao_handoff_note keeps only the bounded summary contract', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'xinchao_handoff_note',
      arguments: {
        session_id: 'claude-old-window',
        event_id: 'handoff-7',
        note: '已经完成召回门控，下一步检查备份。',
        ttl_hours: 48,
        transcript: '不允许的整段聊天原文',
      },
    },
  }, handlers());
  const received = result.body.result.structuredContent.received;
  assert.equal(received.note, '已经完成召回门控，下一步检查备份。');
  assert.equal(received.ttlHours, 48);
  assert.equal('transcript' in received, false);
});

test('xinchao_context falls back to the stable transport session and 2200 token default', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'xinchao_context', arguments: {} },
  }, handlers());
  assert.equal(result.status, 200);
  assert.equal(result.body.result.isError, false);
  assert.equal(result.body.result.structuredContent.sessionId, 'transport-session-1');
  assert.equal(result.body.result.structuredContent.maxTokens, 2200);
  assert.match(result.body.result.content[0].text, /transport-session-1/);
});

test('initialized notification uses an empty 202 response', async () => {
  const result = await handleMcpMessage({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, handlers());
  assert.equal(result.status, 202);
  assert.equal(result.body, null);
});
