# 更新日志

本项目遵循语义化版本。除非特别说明，所有外部模型、长期记忆、OAuth 与通知能力均保持默认关闭。

## 2.4.0 — 2026-08-03

### 用户互动 Runtime Bridge

- 新增持久化 `/bridge/v1/*` 服务端队列，提供健康检查、SSE 到期通知、一次性正文读取与严格 ACK。
- Bridge 只接受 `user_interaction`、`user_note`、`scheduled_interaction`；梦境、思念、内部状态与 AI 自主活动不能自动注入窗口。
- Dashboard 语义互动可幂等入队；另提供便签/预约创建和脱敏队列状态读取。
- 新增独立 `BRIDGE_MACHINE_TOKEN`，必须至少 32 字符且不能复用 Service/Dashboard 凭据。
- 新增过期、最大队列、失败重试状态与 30 天已送达审计保留边界。

### 验证

- 新增队列持久化、去重、用户来源限制、HTTP 鉴权、真实投递信封与 ACK 回归测试。

### 可视化与多端接入地基

- 新增默认脱敏、固定结构的 Dashboard Snapshot，十二维花瓣、梦境星云和桌面/手机 UI 可共用同一数据契约。
- 新增只读取结构化 Transition Journal 的时间线接口，支持 limit、type 和 since 过滤，不返回聊天、梦境或 handoff 正文。
- 新增多终端接入清单，区分网页 Session、远程 MCP OAuth、远程 MCP Bearer 与服务端 HTTP Bearer，清单本身不含凭据。
- 新增独立 Dashboard 访问口令换取 HttpOnly、SameSite 只读会话；默认关闭并要求使用不同于 `SERVICE_TOKEN` 的 32 位以上口令。
- 梦境摘要与余韵文字默认不进入 Dashboard，只有自托管者显式设置 `DASHBOARD_INCLUDE_PRIVATE_TEXT=true` 才展示。
- 新增独立 `packages/wake-bridge` 协议包，定义梦境余韵、思念内容、自主行动结果及 `pending_from_me` 的用户/AI 双通道信封与消费状态。

### 安全与测试

- Dashboard 登录增加基础失败次数限制；会话只保存在进程内存，不写入 state 或日志。
- Wake Bridge 拒绝 Authorization、Cookie、服务 Token、原始 prompt 和原始聊天字段，并限制 payload 大小。
- 新增 Dashboard 投影、会话、接入清单、Journal 查询及 Wake Bridge 隐私回归测试。
## 2.3.4 — 2026-08-01

### 安全加固

- 启动阶段拒绝 `.env.example` 的占位 `SERVICE_TOKEN`：忘记替换示例值时服务
  直接报错并给出生成命令（`openssl rand -hex 32`），示例值永远不会成为
  公开可查的真实凭据。
- `SERVICE_TOKEN` 强制不少于 32 字符，弱 token 同样在启动阶段失败，
  与鉴权比较使用的常量时间对比（`timingSafeEqual`）配套。
- `SECURITY.md` 补充 `MCP_PATH_TOKEN` 的暴露面说明：URL 路径会进入反代与
  CDN 日志、浏览器历史，该模式仅作为无法发送请求头的客户端的兼容回退，
  优先使用 `Authorization` 头，并建议更频繁地轮换路径 token。

### 兼容性

- 已按文档生成随机 token 的现有部署不受影响；只有仍在使用占位值或
  短于 32 字符 token 的部署会在升级后拒绝启动——这正是本次要拦下的情况。

## 2.3.3 — 2026-07-31

### 外部记忆兼容

- 开启 OB 读取、写入或 Context 联动时，同时要求配置 `OMBRE_MCP_URL` 与
  `OMBRE_MCP_TOKEN`；缺少任一项会在启动阶段明确失败，避免后台持续产生 401。
- 文档明确外部记忆 token 只能保存在服务端环境变量中，不能使用 Dashboard
  密码代替，也不能写入浏览器、URL 或公开仓库。
- 默认行为不变：外部记忆读写和 Context 联动仍全部关闭。

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
