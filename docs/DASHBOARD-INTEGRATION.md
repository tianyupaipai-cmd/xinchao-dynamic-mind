# 可视化与多终端接入地基

这份文档面向可视化网页、自建前端、手机端和第三方 Agent 的开发者。心潮核心状态机不依赖任何 UI；花瓣、星云和时间线只是同一份稳定数据契约的不同呈现。

## 先选对入口

| 使用者 | 推荐入口 | 凭据放在哪里 |
| --- | --- | --- |
| 手机/电脑浏览器、PWA | Dashboard 同源会话 | 用户只在登录页输入独立 Dashboard 口令；浏览器收到 HttpOnly Cookie |
| Claude、ChatGPT、Gemini 等网页 AI | 远程 MCP + OAuth 2.1/PKCE | 在心潮授权页输入 OAuth 授权口令 |
| Claude Code、Codex、IDE Agent | 远程 MCP Bearer | 本地私有配置或 token 文件 |
| 自建后端、CLI、自动化 | HTTP API Bearer | 服务器环境变量或私有 secret store |
| 完全不支持 hook 的前端 | MCP `xinchao_context` / `xinchao_event` | 跟随对应 MCP 认证方式 |

不要让浏览器 JavaScript 保存 `SERVICE_TOKEN`，也不要把 token 放进 URL、localStorage、公开仓库或截图。

## 启用只读 Dashboard 会话

Dashboard 默认关闭。生成一个与 `SERVICE_TOKEN` 不同的随机口令：

```bash
openssl rand -hex 32
```

写入服务端 `.env`：

```env
DASHBOARD_ENABLED=true
DASHBOARD_PUBLIC_BASE_URL=https://xinchao.example.com
DASHBOARD_ACCESS_TOKEN=这里填写刚生成的独立随机口令
DASHBOARD_SESSION_TTL_SECONDS=43200
```

梦境摘要和余韵可能包含私密文字，因此默认只返回梦的时间、来源和“是否有余韵”等结构信息。只有自托管者明确接受这一风险时才开启：

```env
DASHBOARD_INCLUDE_PRIVATE_TEXT=true
```

网页应与 API 同源部署。登录时只交换一次口令：

```js
await fetch('/dashboard/session', {
  method: 'POST',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ access_token: userEnteredDashboardToken }),
});
```

后续只使用 HttpOnly Cookie：

```js
const snapshot = await fetch('/dashboard/api/snapshot', {
  credentials: 'include',
}).then((response) => response.json());
```

除下述语义互动外，Dashboard API 保持只读，不提供直接修改驱动力、删除记忆或执行管理动作的浏览器接口。

唯一的有界写入口是语义互动事件：

```text
POST /dashboard/api/interactions
```

请求只接受不可重复的 `event_id` 与固定枚举 `interaction_type`。它不接受
`driveDeltas`、目标数值或满足倍率；服务端根据既有规则结算，并受幂等与每日次数上限保护。
因此网页可以表达“抱抱、陪伴、分享、和好”等已经发生的动作，但不能直接操纵十二维数值。

## UI 数据接口

### `GET /dashboard/api/snapshot`

用于花瓣、数值卡、梦境星云和运行状态。主要字段：

- `drives`：固定 12 项，包含 `key`、`label`、`value`、`percent`、`level`；
- `topDrives`：当前最高的 4 个维度；
- `runtime`：清醒/睡眠、疲惫、最后在场时间、当前窗口数；
- `thoughts`：闪念和执念数量及按维度聚合的强度，不含正文；
- `dreams`：默认只有结构元数据；私密文字需要显式开启；
- `capabilities`：当前部署启用了哪些可选适配器。

服务端内部集成也可携带 `Authorization: Bearer <SERVICE_TOKEN>` 访问等价的 `GET /v1/dashboard/snapshot`。

### `GET /dashboard/api/timeline`

返回 Transition Journal 中已经脱敏的结构化变化。支持：

```text
?limit=50&type=conversation_event,settle&since=2026-08-03T00:00:00.000Z
```

`limit` 最大 200。时间线没有聊天正文、梦境正文、handoff 内容或认证信息，适合做“潮汐变化”动画和运行历史。

### `GET /dashboard/api/connect`

返回当前部署支持的接入档位、端点与心跳建议，但永远不返回任何凭据。可视化网页可以据此生成“如何连接 Claude / Codex / 自建前端”的引导页。

服务端 Bearer 等价端点为 `/v1/dashboard/timeline` 和 `/v1/dashboard/connect`。

## 用户互动连接桥

连接桥的前提是用户已经部署并连接自己的心潮。它只运输用户主动创建的互动、便签和预约，不自动注入梦境、思念、内部状态或 AI 自主行动。

心潮 2.4.0 提供 `/bridge/v1/*` 服务端耐久队列；独立 `xinchao-runtime-bridge` 负责本地 SSE、注入器与 ACK。启用时必须配置与其他凭据不同的 `BRIDGE_MACHINE_TOKEN`。浏览器只持有 Dashboard HttpOnly 会话，永远不能接触机器 Token。

服务端只通过 SSE 通知 `deliveryId`，正文由已鉴权 Bridge 单独读取。Runtime 真正接受目标会话后才允许 ACK `delivered`；临时失败使用 `retryable_failed`，消息继续留在耐久队列。浏览器可创建互动，但看不到机器 Token。

## 心跳档位

- 大上下文、具备 hook 的本地 Agent：可按消息上报隐私版 heartbeat；
- 普通上下文 Agent：建议降频或随 `breath`/会话事件上报；
- 无 hook 前端：使用 `xinchao_context`、`xinchao_event` 或手动上报。

heartbeat 只是小型 HTTP 事件，不会向模型注入上下文。接入清单中的三个档位是对实时性、网络请求量和客户端能力的选择，不是用户等级。
