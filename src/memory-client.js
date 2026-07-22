export class MemoryClient {
  constructor(config) {
    this.config = config;
    this.sessionId = null;
    this.initializePromise = null;
  }

  async post(payload, expectBody = true) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Memory-Caller': 'xinchao-dynamic-mind',
    };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const response = await fetch(this.config.url, {
      method: 'POST', headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Memory MCP failed: HTTP ${response.status}`);
    this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId;
    if (!expectBody) return null;
    const text = await response.text();
    return text ? parseMcp(text) : null;
  }

  async initialize() {
    if (this.sessionId) return;
    if (!this.config.url) throw new Error('MEMORY_MCP_URL is required when memory integration is enabled');
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await this.post({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'xinchao-dynamic-mind', version: '2.0.0' },
          },
        });
        if (!this.sessionId) throw new Error('Memory MCP did not return a session id');
        await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
      })().finally(() => { this.initializePromise = null; });
    }
    return this.initializePromise;
  }

  async call(name, args = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.initialize();
      try {
        return await this.post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } });
      } catch (error) {
        if (attempt || !/HTTP (400|404)/.test(error.message)) throw error;
        this.sessionId = null;
      }
    }
    throw new Error('Memory MCP call failed after session refresh');
  }

  async recentMaterial() {
    const result = await this.call(this.config.readTool, {
      query: '近期重要记忆、情绪、关系变化和未完成事项',
      max_results: this.config.breathMaxResults,
      max_tokens: this.config.breathMaxTokens
    });
    return extractText(result).slice(0, 10000);
  }

  async daytimeMaterial() {
    const result = await this.call(this.config.readTool, {
      query: '白天自然浮现的近期记忆、具体细节、未说完的话和当下牵挂；不要返回系统配置或技术信息',
      max_results: this.config.breathMaxResults,
      max_tokens: this.config.breathMaxTokens
    });
    return extractText(result).slice(0, 10000);
  }

  async storeDream(dream) {
    if (!this.config.writeEnabled) return null;
    const content = [
      `梦境：${dream.dream}`,
      `梦境余韵：${dream.residue}`,
      `醒后意识：${dream.awareness}`,
      '说明：这是睡眠结算产生的模拟梦境，不是现实事件；读取外部记忆不代表意识状态发生变化。'
    ].join('\n');
    const result = await this.call(this.config.writeTool, { content, kind: 'dream', pin: false });
    const text = extractText(result);
    return text.match(/[a-f0-9]{12,}/i)?.[0] ?? null;
  }
}

function parseMcp(text) {
  const data = text.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim() ?? text;
  return JSON.parse(data);
}

function extractText(result) {
  const content = result?.result?.content ?? result?.content ?? [];
  return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
}
