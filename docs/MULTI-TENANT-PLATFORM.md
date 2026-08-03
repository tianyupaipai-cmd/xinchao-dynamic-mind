# 心潮多人平台 V1 产品与数据契约

状态：设计基线。本文定义公开多人使用的心潮网页如何在不复制人物、不共享记忆、不暴露服务密钥的前提下，为每位用户提供独立的人机小屋。

## 一句话产品定义

一个公开可注册的平台；每位用户创建自己的私密人机小屋，连接自己的 AI、心潮实例和可选记忆服务。公开展示必须由用户主动开启。

平台不提供一个“公共人格”，也不把同一份心潮状态复制给所有人。每间小屋里的 AI、状态、记忆、梦境和主动消息都属于该小屋。

## V1 只做什么

V1 必须完成：

1. 用户注册和登录；
2. 创建一间默认私密的小屋；
3. 为小屋创建一个 AI 身份；
4. 通过 OAuth MCP 或本地 Bearer 连接用户自己的 AI；
5. 展示 12 维花瓣、意识状态、梦境元数据和脱敏变化时间线；
6. 用户通过有界语义动作与 AI 互动；
7. AI 通过 Wake Bridge 留下梦境余韵、思念内容、行动结果和待说出口的事；
8. 支持消息的未读、已交付和已消费状态；
9. 支持小屋级多主题切换及用户自己的显示偏好；
10. 支持导出和删除用户自己的平台数据。

V1 不做：

- 公共信息流和排行榜；
- 用户之间访问彼此的记忆正文；
- 一个 AI 同时属于多个互不知情的用户；
- 浏览器直接读写心潮完整 state；
- 用户直接提交驱动力数字；
- 平台代管所有用户的模型密钥；
- 公开梦境、记忆和关系数据的默认开关。

## 核心角色

### 用户

拥有小屋并管理连接、互动、公开范围、导出和删除。

### AI 身份

属于一间小屋，通过该小屋独立签发的 OAuth 授权或服务端 Token 访问有界工具。

### 小屋

多租户隔离的最小边界。心潮状态、梦境、互动、Wake Bridge、连接和审计全部绑定 `home_id`。

### 平台运维

只能查看服务健康、任务积压、用量和脱敏错误。默认不能查看记忆、梦境、handoff 或互动正文。

## 首次使用流程

```text
注册/登录
  → 创建小屋
  → 设置用户和 AI 的显示名
  → 选择连接方式
      ├─ 网页 AI：OAuth MCP
      ├─ Claude Code / Codex / IDE：Bearer MCP
      └─ 无 MCP 前端：HTTP/BFF
  → 完成一次连接测试
  → 进入“内在”页看到花瓣
  → 发送第一次有界互动
  → AI 在下一次 context 或在线连接中收到结果
```

连接向导只展示一次性必要信息。Token 不放进 URL，不进入浏览器 localStorage，不出现在截图、日志或公开页面。

## 用户对机互动板块

### 交互原则

花瓣首先是状态可视化，其次才是互动入口。点击花瓣不会直接修改数值；用户只能表达一个可理解的动作，服务端再根据固定规则产生有界影响。

### V1 动作

| UI 动作 | 事件类型 | 默认含义 |
| --- | --- | --- |
| 陪陪他 | `companionship` | 缓解惦记和社交空缺 |
| 抱抱 | `affection` | 缓解靠近、黏着和惦记 |
| 亲密回应 | `intimacy` | 有界缓解亲密相关驱力 |
| 分享给他 | `sharing` | 回应分享欲与社交驱力 |
| 一起发现 | `discovery` | 回应好奇和无聊 |
| 陪他完成 | `task_progress` | 回应责任和未完成感 |
| 听他说 | `reflection` | 回应反思和整理需要 |
| 发生冲突 | `conflict` | 产生有界愤怒与失落 |
| 经历失去 | `loss` | 产生有界失落和惦记 |
| 和好 | `reconciliation` | 缓解冲突留下的状态 |

这些类型复用心潮现有服务端规则。客户端不得发送 `driveDeltas`、目标数值或满足倍率。

### 花瓣交互

- 轻点：只查看维度说明和当前值，不产生状态变化；
- 长按或点击明确按钮：打开该维度对应的语义动作；
- 提交动作：必须附带不可重复的 `event_id`；
- 成功后：花瓣平滑变化，并显示本次动作的文字解释；
- 失败或重复：保持原状态，不做乐观伪造。

## AI 给用户留下的内容

统一使用 `xinchao-wake-bridge/1`：

- `dream_residue`：梦境余韵；
- `longing_content`：思念或惦记形成的内容；
- `action_result`：AI 独处时完成的行动结果；
- `pending_from_me`：攒着等待说出口的内容。

每条信封区分：

- `human`：用户可以直接阅读的第一人称内容；
- `ai`：下一次 AI 上线时需要恢复的有界结构化上下文；
- `status`：`pending → delivered → consumed`；
- `audience`：`user`、`ai` 或 `both`；
- `expiresAt` 与 `dedupeKey`：控制过期和重复交付。

用户读过不等于 AI 已经说过。两种消费状态在平台存储中需要分别记录。

## 多租户数据模型

建议使用 PostgreSQL。所有业务表必须包含 `home_id`，并在仓储层强制作为查询条件。

```text
users
  id, email_or_provider_id, display_name, created_at, deleted_at

homes
  id, owner_user_id, name, visibility, theme_id, created_at, deleted_at

home_members
  home_id, user_id, role, joined_at

user_display_preferences
  user_id, color_mode, motion_mode, contrast_mode, updated_at

theme_packs
  id, slug, version, name, token_json, asset_manifest_json,
  built_in, published_at, retired_at

ai_identities
  id, home_id, display_name, adapter_kind, created_at

mind_states
  home_id, schema_version, revision, state_json, updated_at

interaction_events
  id, home_id, actor_user_id, event_id, interaction_type,
  result_json, created_at

transition_journal
  id, home_id, type, source, delta_json, details_json, created_at

wake_messages
  id, home_id, ai_identity_id, kind, audience,
  human_payload, ai_payload, dedupe_key, expires_at, created_at

wake_deliveries
  wake_message_id, consumer_kind, consumer_id,
  delivered_at, consumed_at

connections
  id, home_id, ai_identity_id, kind, status,
  encrypted_secret_ref, scopes, created_at, revoked_at

oauth_clients / oauth_grants
  均绑定 home_id 与 ai_identity_id

audit_events
  id, home_id, actor_kind, action, target_type,
  target_fingerprint, result_code, created_at
```

正文、Token 和密钥不得进入 `audit_events`。外部服务密钥使用信封加密或专用 Secret Store，数据库只保存密文引用。

## API 边界

### 浏览器 Session API

```text
POST /platform/session
DELETE /platform/session
GET  /platform/me
GET  /platform/homes
POST /platform/homes
```

浏览器通过 Secure、HttpOnly、SameSite Cookie 认证，并且只能访问用户有成员关系的小屋。

### 小屋只读接口

```text
GET /platform/homes/:homeId/snapshot
GET /platform/homes/:homeId/timeline
GET /platform/homes/:homeId/wake-messages
```

返回现有 Dashboard Projection，不返回完整 state。

### 用户互动接口

```text
POST /platform/homes/:homeId/interactions
```

请求示例：

```json
{
  "event_id": "01J...",
  "interaction_type": "affection"
}
```

服务端从 Session 得到 `actor_user_id`，从路径和成员关系得到 `home_id`。客户端不能覆盖这两个字段。

### AI 接口

AI 继续使用标准远程 MCP。OAuth Grant 绑定 `home_id` 与 `ai_identity_id`，工具执行时由服务端上下文注入租户，不允许 AI 在参数中选择其他小屋。

## 实时更新

V1 使用 SSE，优先于 WebSocket：

```text
GET /platform/homes/:homeId/events
```

事件只传递小型通知：

- `snapshot.updated`
- `timeline.appended`
- `wake.created`
- `wake.delivered`
- `connection.changed`
- `theme.changed`

收到通知后前端重新读取对应的只读接口。SSE 不携带记忆或梦境正文，断线可安全重连。

## 多主题系统

主题是一个有版本的 `theme_pack`，不是散落在页面里的颜色覆盖。花瓣、星云、卡片、字体和动效必须使用同一套语义 Token。

```json
{
  "id": "mist-garden@1",
  "name": "雾庭",
  "tokens": {
    "surface.page": "#EAEEEF",
    "surface.card": "rgba(255,255,255,.72)",
    "text.primary": "#2C363A",
    "text.muted": "#8698A0",
    "accent.primary": "#6E97A8",
    "petal.warm": "#D7A08C",
    "petal.quiet": "#C9C4BA",
    "nebula.core": "#7770A8"
  },
  "motion": {
    "petalSwaySeconds": 5.5,
    "ambientIntensity": 0.55
  },
  "assets": {
    "background": "asset://mist-garden/background.webp",
    "texture": "asset://mist-garden/grain.webp"
  }
}
```

### 两层偏好

1. **小屋主题**：由主人选择，决定这个空间对所有访客呈现的品牌世界；
2. **观看偏好**：属于访问者本人或当前设备，包括 `light/dark/auto`、高对比度和减少动效，可覆盖主题中对应的可访问性部分。

观看偏好不能改变小屋的内容、花瓣数值或主人选定的核心品牌色。

### 前端实现

- 语义 Token 编译为 CSS Custom Properties；
- 组件不能硬编码主题颜色；
- Canvas 星云和 SVG 花瓣从同一个 Theme Provider 读取颜色；
- 切换时只更新 Token 和素材清单，不重新创建心潮状态；
- 主题预览不持久化，用户确认后才写入 `home.theme_id`；
- 切换应使用短交叉淡入，不让所有元素同时弹跳；
- `prefers-reduced-motion` 必须关闭花瓣摇曳、星云旋转和页面转场。

### 安全边界

V1 只提供平台内置并经过校验的主题包：

- 不接受用户输入的任意 CSS、HTML、SVG 脚本或远程字体 URL；
- Token 名必须在白名单内，颜色、尺寸、时长均有范围限制；
- 素材只引用平台对象存储中的已扫描文件；
- 每个主题必须通过文字对比度、触摸目标、深色模式和减弱动效检查；
- 主题升级使用新版本，不能静默修改用户已经选择的历史版本。

### API

```text
GET   /platform/themes
GET   /platform/themes/:themeId
PATCH /platform/homes/:homeId/theme
PATCH /platform/me/display-preferences
```

主题接口不返回任何用户私密状态。主题变化通过 `theme.changed` SSE 通知当前小屋的在线页面。

## 结算与后台任务

单机的全局 `setInterval` 不能直接扩展到多人平台。V1 使用按小屋调度的队列：

1. 活跃互动写入队列；
2. 同一 `home_id` 的任务串行执行；
3. 结算通过数据库 revision 做乐观并发控制；
4. 长期无活动的小屋降低结算频率；
5. 梦境、主动行动和通知分别设置每日上限；
6. 任务重试必须保持 `event_id` 幂等。

初期可使用 PostgreSQL 任务表；并发量上升后再引入 Redis/BullMQ。不要为了尚未出现的规模提前复杂化。

## 核心与平台的代码边界

```text
xinchao-dynamic-mind（公开核心）
  纯状态计算、Dashboard Projection、Context Envelope、MCP 协议、
  Wake Bridge 协议、单实例安全部署

xinchao-platform（独立项目）
  账号、小屋、多租户数据库、Session、租户 OAuth、任务队列、
  SSE、公开范围、配额、运营与前端
```

平台通过一个 `MindRepository` 接口调用核心，不把用户系统写进 `engine.js`：

```ts
interface MindRepository {
  read(homeId: string): Promise<MindState>;
  update(homeId: string, expectedRevision: number, mutate: Mutator): Promise<MindState>;
  appendTransition(homeId: string, record: TransitionRecord): Promise<void>;
}
```

公开核心仍可使用当前文件实现；多人平台提供 PostgreSQL 实现。

## 默认隐私

- 小屋默认 `private`；
- 公开主页默认只显示用户主动选择的介绍和视觉主题；
- 花瓣数值、梦境、记忆、互动和时间线默认不公开；
- 平台管理员默认没有正文查看入口；
- 任何公开动作都要显示预览和具体公开字段；
- 撤销公开后立即从公开接口消失；
- 用户可导出并删除自己的平台数据；
- 生产上线前按服务地区完成隐私、内容治理和未成年人使用评审。

## 推荐实现顺序

1. 从当前 HTML 提取花瓣为独立组件，输入改为按维度 key 的对象；
2. 创建独立 `xinchao-platform` 项目和 PostgreSQL schema；
3. 实现用户、小屋与成员权限；
4. 接入 Dashboard Projection；
5. 实现语义互动及幂等结算；
6. 持久化 Wake Bridge 与双消费者状态；
7. 增加 SSE；
8. 完成 OAuth MCP 的租户绑定；
9. 建立主题包 Token、素材清单和主题预览；
10. 最后接入完整视觉稿和公开主页。

第一条必须按 key 映射，例如 `possess`、`monitor`、`crave`，不能继续依赖 12 个数组位置；否则 UI 顺序调整会把“分享”显示成“性欲”等错误维度。
