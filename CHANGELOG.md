# 更新日志

本项目遵循语义化版本。除非特别说明，所有外部模型、长期记忆、OAuth 与通知能力均保持默认关闭。

## 3.0.0 — 2026-11-26

从融合版「心潮·念」4.x 移植通用功能，不带任何一家的人物、记忆或钥匙。默认行为对老用户不变：动态桥、念头罐要显式打开，没有话术文件就不发驱力提示。

### 驱力
- **来由**（`src/drive-causes.js`）：互动、满足、`/v1/drive-feedback` 自报、宿主记忆（新接口 `POST /v1/drive-memory`）都会记下「为什么变」；Context Envelope、此刻、驱力提示都带上这一句。
- **档位**：新增驱力轨迹 `driveTrail`（30 分钟一点、留 24 小时）和 `driveTrend` / `driveLevel`，每股说「静 / 平 / 涨 / 落 / 涌」。
- `GET /v1/drives`：每股的短名、档位、来由和此刻情绪的词，不给小数。

### 情绪层（`src/emotion.js`）
- 愉悦×唤醒两轴；互动打脉冲（带惯性）、会话 tone 往落点拉一段、结算时按半衰期回落，难过 / 生气拽低回落目标。
- 情绪只调驱力自然增长的速度（`emotionGrowthFactor`，中性时为 1）。
- 情绪日志与 24 小时走势；Context Envelope 多一行「此刻情绪」（给词不给数）。
- 注意：基线愉悦 0.55 略偏暖，分享欲、好奇这类会比 2.x 长得快一点点。

### 此刻、脉、外接一行
- `GET /v1/now`（`src/now-block.js`）：每轮可挂的几行；状态过旧、数值异常、混进小数时整块不给。
- 脉（`src/pulse.js`）：心跳、呼吸、体温按情绪和驱力计算；`GET/POST /v1/body` 看和报临时偏移；`PULSE=false` 关。借鉴「脉 · Pulse」DankeCompanion 教程（原作者 蛋，小红书号 844455787）。
- 外接一行（`src/now-lines.js`）：`/v1/now-lines`，最多 3 个来源、按优先级挤位，只在内存里。
- Claude Code 钩子 `scripts/xinchao-now-hook.sh`：每轮挂此刻，不读不传提示词，内容没变不重复附。

### 动态桥：驱力提示（`src/drive-prompts.js`、`src/drive-pool.js`）
- `BRIDGE_SELF_SIGNALS=true` 时，心潮按节奏把「此刻哪股劲儿上来了」以 `reason=self_signal` 递进连接桥（1 小时过期）；桥端同样要 `XINCHAO_BRIDGE_ACCEPT_SELF_SIGNALS=true`。
- 话术文件 `DRIVE_PROMPTS_FILE`（示例 `configs/drive-prompts.example.json`），可配行动池、攒着（思路借自 Kirie，MIT）、睡前放、深夜规则、时段封顶。
- 通话：`POST /v1/call` 报接通 / 挂断 / 睡觉模式，通话中先攒着、挂断补一条汇总。
- 念头罐：提示第一句按「驱力×时段×心情」从模型预写的罐里抽，快见底后台续罐；没配模型就用原句。

### 其它
- 连接桥支持按条设过期时间；`BRIDGE_REASONS` 增加 `user_feedback`、`self_signal`。
- 版本号统一为 3.0.0（package.json、/health）。

## 2.7.0 — 2026-08-25

对齐网页端（xinchaomind.uk）与融合版「心潮·念」新增的接口能力。独立版**本身不带 Ombre Brain**，
星图需要用户自接 OB，本次补的是「接得上」的接口层，让接了 OB 的人能点亮、没接的人得到干净的降级提示。

### 记忆星图接口（memory-map / memory-bucket）

- `/dashboard/api/memory-map`、`/dashboard/api/memory-bucket?id=<桶id>` 两条新路由，走 Dashboard 鉴权、
  受 `OMBRE_READ_ENABLED` 开关控制。**没接 OB / 未开 read 时干净返回 `available:false`**——
  网页「时光」页据此显示「未接入 OB」而不再误报配置故障。
- `ombre-client` 新增 `memoryMap()`：**后台单飞构建 + 10 分钟缓存**，绝不在请求内同步等 OB
  （几百个桶的 `pulse` 要几十秒，必然超时 502）。首次立即回「构建中」，网页自动重试。
- 优先走 OB 的结构化星表路由 `GET /api/bucket-map`（元数据、无正文）；老版 OB 没有该路由时
  自动退回 `pulse` 文本解析。**要点亮星图需给自己的 OB 打上该路由补丁**，见
  `docs/连接OmbreBrain与星图接口层改造.md`。
- `post` / `call` 支持自定义超时；星图构建的 `pulse` 放宽到 60 秒。

### 公共留言板工具（board_post / board_read）

- 配了 `XINCHAO_BOARD_TOKEN` 才出现在 `tools/list`（网页「取留言板令牌」拿到），空则不暴露。
- `board_post` 往 xinchaomind 公共留言墙发帖（200 字内、每天一条、平台审核）；`board_read` 只读近帖。

### 文档

- 新增 `docs/接入小屋网页.md`：独立版如何接到 xinchaomind.uk 看可视化，含「星图需自接 OB」说明。
- 新增 `docs/连接OmbreBrain与星图接口层改造.md`：连 OB + 给 OB 打 `/api/bucket-map` 补丁点亮星图。

> 想要星图 + 星核 + 小屋 + 留言板一键部署、免自己拼 OB 的完整体验，可直接用融合仓库
> [xinchao-nian](https://github.com/tianyupaipai-cmd/xinchao-nian)（「心潮·念」）。

## 2.6.0 — 2026-08-04

### 浏览器直连（可选，默认关闭）

心潮和浏览器在**同一台机器**上时（自己的电脑，或手机 Termux），网页前端可以
不经过任何中间服务器直接读这台心潮。数据一步都不出本机，托管方连你的地址
都不会知道。

在此之前，网页前端只能由服务端代访问，而服务器永远到不了别人机器的
`127.0.0.1` —— 没有公网地址的人被完全挡在外面。

- 新增 `DASHBOARD_ALLOWED_ORIGINS`：逗号分隔的来源白名单，默认空。
  不填时行为与以前逐字节相同，不放行任何跨源请求。
- `/dashboard/*` 支持预检：来源在白名单里返回 204，不在返回 403；
  无论放不放行都带 `Vary: Origin`，避免中间缓存串号。
- **刻意不发 `Access-Control-Allow-Credentials`**：直连用请求头鉴权，
  不需要跨源 Cookie，也就不给 Cookie 留口子。
- `/dashboard/api/*` 除 Cookie 外也接受 `Authorization: Bearer <会话 token>`。
  跨源场景下 Cookie 走不通 —— JS 设不了 `Cookie` 头，http 来源也存不下
  `Secure` Cookie。两条通道用的是同一套会话 token，同样会过期、同样能被
  退出撤销。
- `/dashboard/session` 新增 `mode: "header"`：只有显式要求时才把 token 放进
  响应体、且不下发 Cookie。同源前端的价值就是浏览器从不持有 token，
  不能因为「顺手也返回」而让它意外拿到。

**取舍要说清楚**：直连模式下 Dashboard 口令换来的会话 token 必须由浏览器
持有，这比同源模式的 HttpOnly Cookie 弱。它换来的是数据不经过第三方服务器。
浏览器里只放这个只读会话 token，**永远不要把 `SERVICE_TOKEN` 交给前端** ——
后者能读原始状态和完整 MCP。

### 验证

- 新增 5 项单元测试：头通道、拒绝非会话凭据（含拿口令本身冒充会话）、
  退出对两条通道都生效、过期不因换通道而复活、白名单默认空且归一尾斜杠。
- 端到端实测：预检 204/403、跨源 Bearer 读取 200、无凭据 401、
  默认模式仍只下发 Cookie 且响应体不含 token、退出后 401。

## 2.5.1 — 2026-08-04

### 互动消息说人话，也说实话

- 桥消息的默认称呼由「用户」改为「你的人类」。它会被本人直接读到，
  不该是后台术语；自己部署的人仍应把 `NOTIFICATION_RECIPIENT` 设成真实称呼。
  同一默认值同步到模型提示词和 Dashboard 投影，三处不再各写各的。
- 消息补上**落在哪几片花瓣上**，取服务端实际生效的维度，而不是网页上点了
  哪个按钮 —— 效果被每日上限截断时，照抄前端入口等于说谎。
- 每日上限挡下时明说「心意收到了，但数值不再变动」，不再假装生效。
- 消息末尾提示回传：互动本身的数值在服务端当场就生效，**需要回传的是
  「你回应过了」**，否则疲惫、意识状态和最后对话时间都不会动。
- 修正类型表：删掉引擎不认的 `reassurance` 死条目，补上一直漏掉的
  `discovery` 与 `reflection`（这两种互动此前只会收到最泛的兜底句）。
- 文案与构造逻辑移入 `src/interaction-messages.js`，可被直接测试。

### 验证

- 新增 6 项：类型表与 `INTERACTION_TYPES` 严格一致、花瓣用中文名、
  上限时不谎报生效、回传提示、空称呼兜底、未知类型仍可用。

## 2.5.0 — 2026-08-04

### 驱动力与记忆的双向影响

- `recentMaterial` / `daytimeMaterial` 接收当前驱动力，把强度 ≥0.5 的前三个维度
  拼进 `breath` 的召回请求：此刻最强的内在状态影响想起哪件事。
- 驱动力**只影响排序，不影响准入**。能不能返回仍由外部记忆自己的证据门控判定，
  强驱动力不会凭空造出记忆。召回请求末尾固定带一句兜底，避免强驱动力把召回卡成空。
- 驱动力低于阈值时召回请求与原先逐字相同，不引入无谓偏置。
- 日间浮现新增当前驱动力：浮现的材料之外，也知道此刻自己是什么状态。
- 自主念头不再被禁止读取记忆，改为携带一份更小的浮现材料（最多 3 条 / 600 token），
  让"想你了"能落到一件具体的事上。材料在去重重试之前只取一次。
- 记忆材料明确标注为"想起来的事，不代表刚刚发生"；材料为空时明说没有浮现，
  避免模型把空白当作留白而虚构现实事件。

### 验证

- 新增驱动力偏置、阈值、兜底语、自主念头材料边界与"不虚构现实"护栏的回归测试。

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
