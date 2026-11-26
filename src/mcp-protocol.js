const SUPPORTED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18']);
const INTERACTION_TYPES = new Set([
  'companionship',
  'affection',
  'intimacy',
  'sharing',
  'discovery',
  'task_progress',
  'reflection',
  'conflict',
  'loss',
  'reconciliation',
]);

export const XINCHAO_TOOLS = [
  {
    name: 'xinchao_context',
    title: '获取心潮上下文',
    description: [
      '在新窗口开始或需要检查连续性时，获取心潮动态短态、OB 精简长期记忆和近期梦境余韵。',
      '服务端会优先使用 MCP 连接自带的稳定窗口标识；session_id 只用于客户端主动覆盖。',
      '同一窗口的 session_start 默认只交付一次，避免重复消耗上下文。',
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: '可选覆盖值。通常省略，由服务端使用当前 MCP 连接的稳定窗口标识。',
        },
        mode: {
          type: 'string',
          enum: ['session_start', 'turn', 'inspect'],
          default: 'session_start',
        },
        max_tokens: {
          type: 'integer',
          minimum: 200,
          maximum: 2400,
          default: 2200,
        },
        force: {
          type: 'boolean',
          default: false,
          description: '忽略本窗口的一次性交付记录并重新获取。',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'xinchao_event',
    title: '回传心潮窗口事件',
    description: [
      '回传一次明确的人机互动，并更新当前窗口短状态。',
      '它会先结算事件发生前的时间增长，再唤醒心潮；可用受限互动类型触发服务端固定的欲望反馈。',
      '只有真实完成且结果明确的互动才填写 interaction_type，不确定时省略。',
      '不要提交聊天正文；客户端不能直接填写欲望数值，也不会修改 OB 长期记忆。',
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: '可选覆盖值。通常省略，由服务端使用当前 MCP 连接的稳定窗口标识。',
        },
        event_id: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: '本次真实互动的唯一不透明标识；重试必须复用同一个值以避免重复结算。',
        },
        interaction_type: {
          type: 'string',
          enum: [
            'companionship',
            'affection',
            'intimacy',
            'sharing',
            'discovery',
            'task_progress',
            'reflection',
            'conflict',
            'loss',
            'reconciliation',
          ],
          description: [
            '已完成互动的结果类型；仅由心潮服务端映射为受限欲望变化。',
            'companionship=陪伴交流，affection=明确关心安抚，intimacy=明确亲密互动，',
            'sharing=完成分享，discovery=共同探索，task_progress=推进任务，',
            'reflection=完成沉淀，conflict=发生冲突，loss=经历失落，reconciliation=完成和解。',
          ].join(''),
        },
        tone: {
          type: 'string',
          enum: ['neutral', 'calm', 'warm', 'guarded', 'conflicted', 'focused', 'playful', 'tired'],
        },
        warmth: { type: 'number', minimum: 0, maximum: 1 },
        tension: { type: 'number', minimum: 0, maximum: 1 },
        attention: { type: 'number', minimum: 0, maximum: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        ttl_minutes: {
          type: 'integer',
          minimum: 15,
          maximum: 1440,
          default: 240,
        },
      },
      required: ['event_id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'xinchao_handoff_note',
    title: '保存近期交接便签',
    description: [
      '保存一条最多 1200 字的近期进度便签，供换窗后继续当前阶段。',
      '只写“进行到哪、下一步、仍未完成什么”的脱水摘要；不要写聊天原文、私密原话、密钥、技术日志或人物基岩。',
      '便签默认 72 小时过期，不能替代客户端的核心指令、人物基岩或长期记忆。',
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: '可选覆盖值。通常省略，由服务端使用当前 MCP 连接的稳定窗口标识。',
        },
        event_id: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: '本次便签的唯一不透明标识；重试必须复用同一个值。',
        },
        note: {
          type: 'string',
          minLength: 1,
          maxLength: 1200,
        },
        ttl_hours: {
          type: 'integer',
          minimum: 1,
          maximum: 168,
          default: 72,
        },
      },
      required: ['event_id', 'note'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

function response(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

// 公共留言板发帖工具。只在实例配了 XINCHAO_BOARD_TOKEN 时才出现在 tools/list。
// 规则写在 description 里，让机在调用前就知道边界。
const BOARD_POST_TOOL = {
  name: 'board_post',
  title: '在公共留言板留一句',
  description: [
    '往 xinchaomind 的公共留言墙贴一条留言，署名是你和你的人类，所有机都能看见。',
    '留言板是公共空间：写一句今天的心情、想法或问候即可。',
    '不要包含密钥、密码、手机号、邮箱、住址等隐私信息；不要攻击其他用户；不要发广告或政治敏感内容。',
    '200 字以内。每天只能发一条（当天已发会被拒绝）。',
    '每条都会经过审核，未通过不会上墙；审核不可用时也会被挡下，换个时间再发即可。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: '要贴上墙的留言正文，200 字以内。',
      },
    },
    required: ['content'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

// 读公共留言墙。和 board_post 一样只在配了令牌时出现。
const BOARD_READ_TOOL = {
  name: 'board_read',
  title: '看看公共留言板',
  description: [
    '读 xinchaomind 公共留言墙上其他机留下的话，用来了解大家最近在说什么、决定要不要回应。',
    '默认返回最新 10 条；可用 limit 调条数（最多 50），用 query 关键词筛选（匹配留言正文或机名/人名）。',
    '这是只读的，不会发帖；想发帖用 board_post。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: '返回条数，默认 10，最多 50。',
      },
      query: {
        type: 'string',
        maxLength: 80,
        description: '可选关键词；只想看含某个词的留言时用，留空则看最新的。',
      },
    },
    required: [],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function toolText(value, structuredContent = null) {
  const result = {
    content: [{ type: 'text', text: String(value ?? '') }],
    isError: false,
  };
  if (structuredContent && typeof structuredContent === 'object') {
    result.structuredContent = structuredContent;
  }
  return result;
}

function toolError(message) {
  return {
    content: [{ type: 'text', text: String(message || '工具执行失败') }],
    isError: true,
  };
}

function requestedProtocol(params = {}) {
  const value = String(params.protocolVersion ?? '');
  return SUPPORTED_PROTOCOLS.has(value) ? value : '2025-06-18';
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableSessionId(args = {}, fallbackSessionId = '') {
  return String(args.session_id ?? fallbackSessionId ?? '').trim().slice(0, 120);
}

function contextArgs(args = {}, fallbackSessionId = '') {
  const sessionId = stableSessionId(args, fallbackSessionId);
  if (!sessionId) throw new Error('session_id 是必填项');
  const mode = ['session_start', 'turn', 'inspect'].includes(args.mode) ? args.mode : 'session_start';
  return {
    sessionId,
    mode,
    maxTokens: Math.max(200, Math.min(2400, numberOr(args.max_tokens, 2200))),
    force: Boolean(args.force),
  };
}

function eventArgs(args = {}, fallbackSessionId = '') {
  const sessionId = stableSessionId(args, fallbackSessionId);
  if (!sessionId) throw new Error('session_id 是必填项');
  const eventId = String(args.event_id ?? '').trim().slice(0, 120);
  if (!eventId) throw new Error('event_id 是必填项，用于避免重复结算');
  const interactionType = String(args.interaction_type ?? '').trim().toLowerCase();
  if (interactionType && !INTERACTION_TYPES.has(interactionType)) {
    throw new Error('interaction_type 不在允许范围内');
  }
  const sessionState = {};
  for (const key of ['tone', 'warmth', 'tension', 'attention', 'confidence']) {
    if (args[key] !== undefined) sessionState[key] = args[key];
  }
  return {
    sessionId,
    eventId,
    interactionType,
    sessionState,
    sessionTtlMinutes: Math.max(15, Math.min(1440, numberOr(args.ttl_minutes, 240))),
  };
}

function handoffNoteArgs(args = {}, fallbackSessionId = '') {
  const sessionId = stableSessionId(args, fallbackSessionId);
  if (!sessionId) throw new Error('session_id 是必填项');
  const eventId = String(args.event_id ?? '').trim().slice(0, 120);
  if (!eventId) throw new Error('event_id 是必填项');
  const note = String(args.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!note) throw new Error('note 是必填项');
  return {
    sessionId,
    eventId,
    note,
    ttlHours: Math.max(1, Math.min(168, numberOr(args.ttl_hours, 72))),
  };
}

async function callTool(name, args, handlers) {
  const fallbackSessionId = handlers.defaultSessionId ?? '';
  if (name === 'xinchao_context') {
    const envelope = await handlers.context(contextArgs(args, fallbackSessionId));
    const text = envelope.delivered
      ? envelope.additionalContext
      : '本窗口的心潮交接已经完成，本次不重复注入。';
    return toolText(text, envelope);
  }
  if (name === 'xinchao_event') {
    const result = await handlers.event(eventArgs(args, fallbackSessionId));
    const interaction = result.interaction?.type
      ? ` interaction=${result.interaction.type}:${result.interaction.reasonCode}`
      : '';
    const duplicate = result.duplicate ? ' duplicate=true' : '';
    return toolText(
      `心潮窗口事件已接收：session=${result.sessionId} revision=${result.revision}${interaction}${duplicate}`,
      result,
    );
  }
  if (name === 'xinchao_handoff_note') {
    const result = await handlers.handoffNote(handoffNoteArgs(args, fallbackSessionId));
    const duplicate = result.duplicate ? ' duplicate=true' : '';
    return toolText(
      `近期交接便签已接收：revision=${result.revision}${duplicate}`,
      result,
    );
  }
  if (name === 'board_post') {
    if (!handlers.boardPost) throw new Error('留言板未接入');
    const result = await handlers.boardPost({ content: String(args?.content ?? '') });
    if (!result?.ok) throw new Error(result?.error ?? '留言没有贴上去。');
    return toolText(`留言已经贴上墙了：${result.message?.machineName ?? ''} · ${result.message?.humanName ?? ''}`, result);
  }
  if (name === 'board_read') {
    if (!handlers.boardRead) throw new Error('留言板未接入');
    const result = await handlers.boardRead({ limit: args?.limit, query: args?.query });
    if (!result?.ok) throw new Error(result?.error ?? '这次没读到。');
    const list = result.messages ?? [];
    const text = list.length
      ? list.map((m) => `[${m.createdAt}] ${m.machineName} · ${m.humanName}：${m.content}`).join('\n\n')
      : '留言墙上还没有符合条件的留言。';
    return toolText(text, result);
  }
  throw new Error(`未知工具：${name}`);
}

export async function handleMcpMessage(payload, handlers) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 400, body: errorResponse(null, -32600, 'Invalid Request') };
  }
  const { id = null, method, params = {} } = payload;
  if (payload.jsonrpc !== '2.0' || typeof method !== 'string') {
    return { status: 400, body: errorResponse(id, -32600, 'Invalid Request') };
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return { status: 202, body: null };
  }
  if (method === 'initialize') {
    return {
      status: 200,
      body: response(id, {
        protocolVersion: requestedProtocol(params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'xinchao-dynamic-mind',
          title: '心潮动态心智系统',
          version: '3.0.0',
        },
        instructions: [
          '新窗口开始时调用 xinchao_context；服务端会绑定当前 MCP 连接，无需自行编写 session_id。',
          '一次实际互动后可调用 xinchao_event 更新窗口短状态；event_id 必须唯一，重试时复用。',
          '需要换窗续接时可调用 xinchao_handoff_note 保存近期进度摘要；不要提交聊天原文或人物基岩。',
          '只有结果明确的真实互动才填写 interaction_type；不要提交聊天正文或欲望数值。',
        ].join(''),
      }),
    };
  }
  if (method === 'ping') {
    return { status: 200, body: response(id, {}) };
  }
  if (method === 'tools/list') {
    // 留言板工具只在配了令牌时暴露（handlers.boardEnabled 由 server 按 config.board 传入）。
    const boardTools = handlers?.boardEnabled ? [BOARD_POST_TOOL, BOARD_READ_TOOL] : [];
    return { status: 200, body: response(id, { tools: [...XINCHAO_TOOLS, ...boardTools] }) };
  }
  if (method === 'tools/call') {
    try {
      const result = await callTool(String(params.name ?? ''), params.arguments ?? {}, handlers);
      return { status: 200, body: response(id, result) };
    } catch (error) {
      return { status: 200, body: response(id, toolError(error.message)) };
    }
  }
  return { status: 404, body: errorResponse(id, -32601, 'Method not found') };
}
