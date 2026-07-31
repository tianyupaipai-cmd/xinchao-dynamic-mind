# 更新日志

本项目遵循语义化版本。除非特别说明，所有外部模型、长期记忆、OAuth 与通知能力均保持默认关闭。

## 2.3.2 — 2026-07-31

### 修复

- 补齐 `POST /v1/handoff-note`，HTTP 客户端现在可以保存并在 Context Envelope 中读回短期交接便签。
- HTTP 便签接受 `snake_case` 与 `camelCase` 字段，继续执行 1200 字上限、1–168 小时 TTL 和 `event_id` 幂等。
- 修复 `/v1/heartbeat` 返回成功却没有刷新 `lastHeartbeatAt` 的问题。
- 所有真实 `xinchao_event` 同时刷新在场时间，避免正在互动时被自主推送误判为长期离线。

### 接入与隐私

- 新增隐私优先的 Claude Code `UserPromptSubmit` hook，只发送会话 ID 与随机事件 ID。
- 文档增加实时、均衡、兼容三种心跳档位，并明确 heartbeat 不等于 `breath`、不占用模型上下文。
- 不建议直接把原始 `UserPromptSubmit` HTTP hook 指向心潮，以免完整 hook 请求体携带提示词正文。

### 测试

- 新增 HTTP 端到端回归测试，覆盖鉴权、heartbeat 状态更新、handoff 幂等与 Context Envelope 回读。

## 2.3.1 — 2026-07-29

### 新增

- 原生 Streamable HTTP MCP：
  - `xinchao_context`
  - `xinchao_event`
  - `xinchao_handoff_note`
- OAuth 2.1 授权码流程、PKCE、动态客户端注册和刷新令牌持久化。
- Context Envelope：统一输出动态短态、近期交接、梦境余韵与可选记忆召回。
- 最多 1200 字、默认 72 小时过期的短期交接便签。
- 结构化转换日志和 Context digest 审计。
- `event_id` 幂等互动结算与每日影响次数上限。

### 修复

- 服务端在 MCP 初始化时签发 `Mcp-Session-Id`，解决模型自行生成 `session_id` 导致的窗口漂移。
- `session_id` 改为可选覆盖值；上下文、事件和交接便签默认绑定当前 MCP 连接。
- MCP Schema 和运行时默认上下文预算统一为 2200 tokens。
- OAuth 客户端、访问令牌和刷新令牌写入独立持久状态文件，容器更新不会清空授权。
- 外部记忆调用明确区分自动写入来源，不冒充人工标记。
- 上下文压缩不再替代客户端的稳定核心资料。

### 隐私与安全

- 窗口事件丢弃聊天正文和客户端提交的任意驱动力数值。
- 交接便签仅用于近期进度，不应存储聊天原文、密钥或人物基岩。
- 审计日志不保存认证头、OAuth Token、模型密钥或记忆正文。
- 所有公网能力仍要求 HTTPS 与独立认证凭据。

### 升级提示

1. 对照 `.env.example` 增加 Context、MCP 与 OAuth 配置；不使用的能力保持 `false`。
2. 保留原有 `state/` 目录，状态结构会在首次结算时兼容迁移。
3. 运行 `npm test`，确认全部测试通过后再替换生产容器。
4. 远程 MCP 客户端重新初始化连接后即可获得稳定窗口 ID；通常无需手动填写 `session_id`。

## 2.0.0 — 2026-07-28

- 首次公开发布。
- 十二维驱动力、念头池、疲惫、睡眠、意图选择与影子模式。
- 可选 OpenAI-compatible 模型、外部记忆 MCP 与 Bark 通知。
- 本机安全默认部署、原子 JSON 状态持久化和 Node.js 原生测试。
