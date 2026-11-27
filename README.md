# 心潮动态心智系统 3.0.0

![心潮动态心智系统](docs/cover.png)

心潮是一个独立、可自托管的 AI 动态状态层。它在对话之外持续维护驱动力、念头池、疲惫、睡眠、梦境余韵与短期窗口状态，并通过 HTTP API 或远程 MCP 接入不同模型、设备和前端。

> 心潮模拟可解释的动态状态，不宣称产生意识、情感或生命。核心状态机可离线运行；模型、长期记忆、OAuth 和通知均为可选适配器。

## 3.0.0 更新重点

这一版把融合版「心潮·念」4.x 里通用的部分搬了过来（去掉了任何一家的人物和记忆）：

- **驱力有来由**：每股驱力记最近一次「为什么变」——刚才的互动、刚被满足、自报的涨落，或者**你自己的记忆系统**通过 `POST /v1/drive-memory` 喂进来的一段记忆。心潮不自带长期记忆，记忆从哪来由你接。
- **驱力有档位**：记驱力轨迹（30 分钟一点、留 24 小时），每股说「静 / 平 / 涨 / 落 / 涌」，不再只是一个小数。
- **此刻**：`GET /v1/now` 给一小块每轮可挂的状态（驱力、情绪、身体），配好的 Claude Code 钩子 `scripts/xinchao-now-hook.sh`。
- **情绪层**：愉悦×唤醒两轴，互动打脉冲、会话语气拉一段、几小时自己平回去；情绪只调驱力长多快，不直接改数。
- **脉**：心跳、呼吸、体温按情绪和驱力算出来，宿主可以报临时偏移。
- **动态桥**：驱力上来时心潮自己按节奏把「哪股劲儿上来了」经连接桥递进 AI 窗口（话术你自己写，可攒着、避开通话和深夜），配念头罐让开头那句每次不一样。两边都要显式打开。
- **外接一行**：别的系统可以往此刻里挂一行（正在一起做的事、天气、日程）。

**这个仓库以后会保持更新**：融合版里验证过、对别人家也通用的功能，会继续整理搬过来。共情、混合感受、自我觉察、黑匣子这些还在融合版里磨，磨稳了再来。

装好以后，给你家 AI 读一遍 [小机手册](docs/小机手册.md)——那是写给它自己的：此刻怎么看、驱力提示怎么用、有哪些工具。

完整差异见 [CHANGELOG.md](CHANGELOG.md)。

## 可视化接入地基（开发中）

当前仓库已经把 UI 与状态机拆开，并提供：

- 默认脱敏的十二维 Dashboard Snapshot；
- 不含正文的结构化潮汐时间线；
- 面向网页 AI、本地 Agent、手机网页与自建后端的接入清单；
- 独立 Dashboard 口令换取 HttpOnly 只读会话，浏览器无需接触 `SERVICE_TOKEN`；
- 独立用户互动 Runtime Bridge 协议；网页只提交语义互动，不直接修改心潮数值。

接口、环境变量和前端示例见 [可视化与多终端接入地基](docs/DASHBOARD-INTEGRATION.md)。视觉主题、花瓣与梦境星云可以独立迭代，不需要重写服务端。

如果要把心潮建设成公开可注册、每人连接自己 AI 的服务，请先阅读 [多人平台 V1 产品与数据契约](docs/MULTI-TENANT-PLATFORM.md)。多人账号、小屋、数据库和任务调度属于独立平台层，不会侵入核心状态计算。

## 支持哪些终端

只要终端支持以下任一方式即可接入：

- 标准远程 Streamable HTTP MCP；
- OAuth 2.1 远程 MCP；
- 能发送 Bearer HTTP 请求的自建前端、桌面端或移动端；
- 通过自己的中间层访问 HTTP API 的 iOS、Android 或其他设备。

心潮不绑定 Claude。Claude、Codex、其他 Agent、自建网页和移动应用可以共享同一个服务端，但每条 MCP 连接会获得独立窗口会话。

## 核心能力

- 十二维驱动力与时间增长规则；每股带档位（涌 / 涨 / 平 / 落）和来由。
- 情绪层（愉悦×唤醒）、脉（心跳呼吸体温）和每轮可挂的「此刻」块。
- 动态桥：驱力提示按节奏经连接桥递进 AI 窗口（可选）。
- 闪念、执念、衰减和意图选择。
- 疲惫、睡眠、梦境余韵与清晨冻结。
- 窗口短态与定时过期。
- 有界语义互动反馈，客户端不能直接提交驱动力数值。
- 可选 OpenAI-compatible 模型。
- 可选 Ombre-compatible 长期记忆 MCP。
- 可选 Bark 通知与跨类型去重。
- 原子状态持久化与结构化转换日志。

## 快速开始

要求：Node.js 20 或更高版本。

```bash
cp .env.example .env
openssl rand -hex 32
# 将输出填入 .env 的 SERVICE_TOKEN
npm test
npm start
```

检查服务：

```bash
curl http://127.0.0.1:18110/health
```

Docker：

```bash
cp .env.example .env
mkdir -p state memory-data
docker compose up -d --build
docker compose ps
```

Compose 默认只映射到 `127.0.0.1:18110`。远程使用时请自行配置 HTTPS 反向代理或 Cloudflare Tunnel，不能直接开放裸端口。

## 远程 MCP

在 `.env` 中启用：

```env
MCP_ENABLED=true
OAUTH_ENABLED=true
OAUTH_PUBLIC_BASE_URL=https://xinchao.example.com
OAUTH_APPROVAL_TOKEN=至少16位的独立授权口令
```

远程 MCP 地址：

```text
https://xinchao.example.com/mcp
```

支持动态客户端注册的客户端不需要手动填写 Client ID 或 Client Secret。授权口令只在你自己的授权页面输入，不要写入客户端 URL、仓库或截图。

### MCP 工具

| 工具 | 作用 |
| --- | --- |
| `xinchao_context` | 获取当前动态短态和近期连续性；同一窗口首次启动默认只交付一次 |
| `xinchao_event` | 回传一次明确互动及有界窗口状态；`event_id` 用于幂等 |
| `xinchao_handoff_note` | 保存限时近期进度摘要，不保存整段聊天原文 |

`session_id` 是可选覆盖值。正常情况下服务端会使用 MCP 连接自带的稳定窗口 ID。

## HTTP API

除 `/health` 与 OAuth 发现/授权端点外，业务 API 都要求：

```http
Authorization: Bearer <SERVICE_TOKEN>
```

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/health` | 健康状态与版本 |
| `GET` | `/v1/state` | 读取完整动态状态 |
| `GET` | `/v1/intent` | 读取当前意图 |
| `GET` | `/v1/breath-context` | 获取紧凑梦境余韵 |
| `GET` | `/v1/context` | 获取 Context Envelope |
| `POST` | `/v1/settle` | 执行状态结算 |
| `POST` | `/v1/conversation-event` | 写入一次明确互动事件 |
| `POST` | `/v1/heartbeat` | 只刷新在场时间，不上传聊天正文 |
| `POST` | `/v1/handoff-note` | 保存短期交接摘要 |
| `POST` | `/v1/drive-feedback` | 管理端受控反馈接口 |
| `GET` | `/v1/now` | 「此刻」块：几行驱力、情绪、身体，给词不给数 |
| `POST` `DELETE` `GET` | `/v1/now-lines` | 外接一行：别的系统往此刻里挂一行 |
| `GET` `POST` | `/v1/body` | 脉：此刻心跳、呼吸、体温；POST 报临时偏移 |
| `GET` | `/v1/drives` | 此刻情绪的词 + 每股驱力的短名、档位、来由（不给小数） |
| `POST` | `/v1/call` | 宿主报通话开始 / 结束 / 睡觉模式，驱力提示据此先攒着 |
| `POST` | `/v1/drive-memory` | 记忆来由插拔口：你自己的记忆系统浮现一条记忆、勾动某股驱力时调，`{ drive, text, date?, id?, driveDelta? }`，此刻里那股驱力会带上「想起 …」 |
| `GET` | `/v1/dashboard/snapshot` | 默认脱敏的可视化状态投影 |
| `GET` | `/v1/dashboard/timeline` | 结构化变化时间线（无正文） |
| `GET` | `/v1/dashboard/connect` | 多端接入能力清单（无凭据） |
| `POST` | `/mcp` | Streamable HTTP MCP |

## 用户互动连接桥

连接桥是可选能力，但前提是先部署好心潮。默认它只将用户主动发出的互动、便签与预约交给用户指定的 AI Runtime；不会自动投递梦境、思念、心潮数值或 AI 的自主内容。想让心潮自己的驱力提示也递进去，见下一节「动态桥」（两边都要显式打开）。

启用服务端队列：

```env
BRIDGE_ENABLED=true
BRIDGE_MACHINE_TOKEN=独立随机口令（至少32字符）
BRIDGE_STATE_PATH=/app/state/bridge-queue.json
```

机器接口均要求 `Authorization: Bearer <BRIDGE_MACHINE_TOKEN>`：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/bridge/v1/health` | 协议与健康检查 |
| `GET` | `/bridge/v1/events` | SSE，只通知到期的 `deliveryId` |
| `GET` | `/bridge/v1/deliveries/:id` | 读取一次待投递用户互动 |
| `POST` | `/bridge/v1/deliveries/:id/ack` | 回传 `delivered` 或 `retryable_failed` |

Dashboard 会话可通过 `POST /dashboard/api/bridge/deliveries` 创建用户便签或预约。机器 Token 不得写入浏览器、URL、日志或公开仓库。客户端见独立项目 [xinchao-runtime-bridge](https://github.com/tianyupaipai-cmd/xinchao-runtime-bridge)。

## 此刻：每轮挂给 AI 的几行

`GET /v1/now` 返回一小块「此刻」，比 Context Envelope 短得多，给词不给数，适合每轮对话前挂进去：

```text
【心潮·此刻】
驱力：好奇（涨；想起 07/10：「那本没看完的书」）
情绪：平静，有点起伏，好奇在动
身体：心跳 102，呼吸偏浅，体温微热
正一起看一部老电影
```

- **驱力**：最高的三股（加上过线的难过 / 生气），每股带档位（静 / 平 / 涨 / 落 / 涌）和来由。
- **情绪**：愉悦×唤醒落成的词，加一点驱力味道；刚才有互动会带「刚才陪着」这类起因，近一天的情绪路径最多五步。
- **身体（脉）**：心跳、呼吸、体温是按情绪和驱力**算**出来的，不表演；宿主可以 `POST /v1/body {"key":"run","hr":30,"minutes":10}` 报一段临时偏移（运动、紧张、发烧）。`PULSE=false` 关掉。借鉴「脉 · Pulse」DankeCompanion 身体感知教程，原作者 蛋（小红书号 844455787）。
- **外接一行**：别的系统（日程、天气、正在一起做的事）`POST /v1/now-lines {"source":"watch","text":"正一起看一部老电影","minutes":15,"priority":1}` 挂一行；最多 3 个来源，只活在内存里，不进状态、记忆、看板和日志。
- **兜底**：状态 3 小时没结算、驱力越界或全卡在同一个高值、块超长或混进小数，就整块不给——宁可这一轮没有此刻，也不灌一段错的。

接 Claude Code：把 `scripts/xinchao-now-hook.sh` 挂成 `UserPromptSubmit` 钩子（设好 `XINCHAO_SERVICE_TOKEN` 和 `XINCHAO_NOW_URL`）。它不读不传你的提示词，内容没变且 30 分钟内附过就不重复附，隔 90 分钟以上再来的第一条必附。可以和 `xinchao-heartbeat-hook.sh` 一起挂。

## 动态桥：驱力提示（实时动态版）

上面的连接桥默认只搬用户发起的东西。把 `BRIDGE_SELF_SIGNALS=true` 打开，并在桥那边设 `XINCHAO_BRIDGE_ACCEPT_SELF_SIGNALS=true`，就是「动态桥」：心潮会按节奏自己把**此刻哪股劲儿上来了**递进 AI 窗口（`reason = self_signal`，桥的示例 Adapter 只挂「心潮」前缀）。任一边关着都退回只供用户互动。

递进去的样子：

```text
驱力提示
· 好奇（涌）：想翻翻新东西。可以去查一下最近在想的那个问题。
· 来由：没被满足，自己慢慢涨
想做就去做，不想就放着。今天第 1 次。
```

- **话术你自己写**：复制 `configs/drive-prompts.example.json` 到 `DRIVE_PROMPTS_FILE`，按你家 AI 的口吻改。键可以用驱力 key 或短名（想她、牵挂、分享欲、好奇……）；没写话术的驱力不提。**没有这个文件整件事不做。**
- **挑哪股**：先看此刻「涌 / 涨」的；没有就看「积」——一直在自己静息线七成以上待满 1.5 小时的。一次只提一股。
- **节奏**：同一股 1.5 小时内不重提；任意两条至少隔 45 分钟（`DRIVE_PROMPT_MIN_GAP_MINUTES`）；白天最多 12 条、夜里另算最多 6 条（`DRIVE_PROMPT_DAY_MAX` / `DRIVE_PROMPT_NIGHT_MAX`，0 = 不设上限）。这些数是我们自己用着合适的，**按你家情况调**。
- **攒着**（思路借自 [Kirie](https://github.com/khaterdev/kirie)，MIT）：`stash` 里的驱力碰上不合适的时候（通话中、刚说过）先记下来，挂断 / 她回来 / 睡前（`bedtimeHour`）合成一条放出来；放之前每条再核一遍，已经落下去的不提。`immediate` 里的从不攒。
- **通话**：宿主接通 / 挂断时 `POST /v1/call {"active": true|false}`，通话中每隔几分钟再报一次 `active: true` 续命（3 小时没续当失联清掉）；只带 `{"sleep": true}` 表示开着电话睡觉，这时照常递。
- **念头罐**（借鉴「脉 · Pulse」DankeCompanion 公开教程的身体事件池，原作者 蛋，小红书号 844455787）：话术第一句（到第一个句号）会换成从「这股劲儿 × 一天里的时段」那罐里抽的一句，同心情优先，抽一句少一句；快见底时后台让模型（`MODEL_*`）再写 15 句。没配模型或罐子空了就用你写的原句。`DRIVE_POOL=false` 关掉。
- **来由**：每股驱力会记最近一次「为什么变」——刚才的互动、刚被满足、自报的涨落，或者你的记忆系统通过 `POST /v1/drive-memory` 喂进来的一段记忆（3 小时内第一次会带原文和日期）。此刻（Context Envelope）和驱力提示都会带上这一句。
- **看驱力**：`GET /v1/drives` 给每股的短名、档位（静 / 平 / 涨 / 落 / 涌）、来由和念头罐最近抽出的那句，不给小数，方便网页或小机画。

## 心跳接入档位

heartbeat 与 `breath` 的定位不同：`breath` 是可能返回上下文的按需记忆检索；heartbeat 只发送 `session_id` 和不透明的 `event_id`，不上传提示词或回复、不注入模型上下文，因此本身不消耗上下文 token。档位差异只影响实时性和网络请求量：

- **实时档**：本地 Claude Code、Max 或具备生命周期 hook 的前端，可在每次提交消息时上报。
- **均衡档**：希望降低请求量时设置 120–300 秒最小间隔；这不是为了节省上下文。
- **兼容档**：Claude.ai 普通连接器、手机或无 hook 前端，在会话开始调用 `xinchao_context`，明确互动后调用 `xinchao_event`，服务端应配置更宽的离线阈值。

Claude Code 可使用仓库中的 [`scripts/xinchao-heartbeat-hook.sh`](scripts/xinchao-heartbeat-hook.sh)。脚本读取 hook 输入后只保留 `session_id`，主动丢弃 `prompt`。不要直接把 `UserPromptSubmit` 配成指向心潮的原始 HTTP hook，否则客户端可能把包含提示词的完整 hook JSON 发送出去。

本机私有 `.claude/settings.local.json` 示例：

```json
{
  "env": {
    "XINCHAO_SERVICE_TOKEN_FILE": "/absolute/private/path/xinchao.service-token",
    "XINCHAO_HEARTBEAT_URL": "https://xinchao.example.com/v1/heartbeat",
    "XINCHAO_HEARTBEAT_MIN_INTERVAL_SECONDS": "0"
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/xinchao-heartbeat-hook.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

token 文件应放在仓库外并设为 `0600`；私有设置不要提交。均衡档将最小间隔改成 `120` 或 `300`。

## 浏览器直连（没有公网地址时）

网页前端默认由**服务端**代访问你的心潮，所以你的心潮必须有一个公网 HTTPS
地址。如果你的心潮跑在自己电脑或手机上，别人的服务器永远到不了你的
`127.0.0.1` —— 这不是配置问题，是做不到。

如果**浏览器和心潮在同一台机器上**，可以改为让浏览器直接读，不经过任何
中间服务器：

```env
DASHBOARD_ENABLED=true
DASHBOARD_ACCESS_TOKEN=
DASHBOARD_ALLOWED_ORIGINS=https://前端地址
```

- 默认为空 = 不放行任何跨源请求。不填时行为与不支持直连时完全一致。
- 只填你自己确实要用的前端地址，逗号分隔多个。
- 前端用 `POST /dashboard/session` 带 `{"mode":"header"}` 换一个只读会话
  token，之后所有请求用 `Authorization: Bearer <token>`。

**限制**：

- 只在浏览器与心潮同机时有效。同一局域网的另一台设备**不行** —— 内网 IP
  不是浏览器认可的可信来源，会被混合内容拦截。
- Safari 对 `http://localhost` 的策略比 Chrome/Firefox 严，可能仍被拦。
- 直连模式下会话 token 由浏览器持有，比同源的 HttpOnly Cookie 弱；
  换来的是数据不经过第三方服务器。**任何情况下都不要把 `SERVICE_TOKEN`
  交给前端**，它能读原始状态和完整 MCP。

## 长期记忆边界

长期记忆不是心潮的必需组件。启用外部记忆时：

```env
OMBRE_MCP_URL=https://memory.example.com/mcp
OMBRE_MCP_TOKEN=
OMBRE_READ_ENABLED=false
OMBRE_WRITE_ENABLED=false
CONTEXT_OMBRE_ENABLED=false
```

- 只要开启 `OMBRE_READ_ENABLED`、`OMBRE_WRITE_ENABLED` 或
  `CONTEXT_OMBRE_ENABLED`，`OMBRE_MCP_URL` 与 `OMBRE_MCP_TOKEN` 就都必须填写；
  缺少任一项时服务会拒绝启动，避免在后台持续产生 401。
- `OMBRE_MCP_TOKEN` 是外部记忆 MCP 接受的服务端 Bearer 凭据，不是 Dashboard
  登录密码。它只能放在心潮服务端 `.env`，不能写入前端、URL 或 Git 仓库。
- 心潮只请求近期连续性，不用短 handoff 替代客户端的稳定核心资料。
- 自动梦境写入会明确标记为自动来源。
- 技术日志、密钥、OAuth 状态和聊天原文不应进入长期人物记忆。
- 所有外部读写默认关闭，按最小权限逐项启用。

## 数据与安全

- 不要提交 `.env`、`state/`、`memory-data/`、OAuth 状态或真实 Token。
- `SERVICE_TOKEN`、`MCP_PATH_TOKEN` 与 `OAUTH_APPROVAL_TOKEN` 必须彼此独立。
- 服务默认绑定回环地址、使用只读容器、移除 Linux capabilities。
- Context audit 只记录摘要与交付元数据。
- Dashboard 使用与服务密钥不同的访问口令，并只签发 HttpOnly、SameSite 会话 Cookie。
- Dashboard 默认隐藏梦境摘要和余韵文字；需要由自托管者显式开启。
- `xinchao_event` 不接受聊天正文；交接便签也只应保存脱水后的近期进度。
- 公开部署前请阅读 [SECURITY.md](SECURITY.md)。

## 测试

```bash
npm test
```

当前测试覆盖状态结算、睡眠与醒来、念头池、窗口隔离、幂等互动、Context Envelope、交接便签、OAuth、MCP 协议、外部记忆适配、通知去重和隐私审计。

## 项目结构

```text
src/             状态机、MCP、OAuth、Dashboard 投影与可选适配器
test/            Node.js 原生测试
configs/         可替换提示词
scripts/         本地配置、部署与烟雾测试
packages/        可独立使用的有界消息信封协议
state/           运行状态挂载目录（不提交真实数据）
memory-data/     可选外部心跳挂载目录
```

## 致谢

- [@ChenxiDawn](https://github.com/ChenxiDawn)：每股驱力的天花板、饱足平台与驱力生长耦合（PR #8）。
- [@7k777](https://github.com/7k777)：HTTP API 请求体字段说明（PR #10）。
- 「脉 · Pulse」DankeCompanion 身体感知教程，原作者 蛋（小红书号 844455787）：脉与念头罐的思路。
- [Kirie](https://github.com/khaterdev/kirie)（MIT）：驱力提示「立刻说 / 攒着 / 不说」的思路。

3.0.0 起仓库历史整理成了一个干净的起点，以前的提交记录保留在各自的 PR 里。

## License

[AGPL-3.0](LICENSE)。可以自由使用、修改和部署；把它（或改过的版本）作为网络服务提供给别人用时，需要按 AGPL 向使用者公开对应的源代码。
