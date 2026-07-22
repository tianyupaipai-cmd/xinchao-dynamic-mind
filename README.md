# 心潮动态心智系统 2.0

![心潮动态心智系统 2.0](docs/cover.png)

心潮是一个独立、可自托管的 AI 动态状态层。它在对话之外持续维护驱动力、念头池、疲惫度、睡眠状态与行动意图，并通过一个小型 HTTP API 与任意 Agent、模型或自动化系统连接。

> 心潮模拟动态心智状态，不宣称产生意识、情感或生命。模型、记忆库和通知渠道都是可选适配器，核心状态机可以完全离线运行。

## 2.0 的核心能力

- **十二维驱动力**：亲密、牵挂、分享、好奇、责任、反思等状态随时间增长或被事件满足。
- **念头池**：短暂念头会衰减，反复出现的主题会形成执念加权，并影响意图选择。
- **疲惫与睡眠**：长时间运行会积累疲惫，空闲后进入睡眠并结算梦境余韵。
- **清晨静默**：可配置凌晨冻结窗口，避免所有驱动力机械增长。
- **意图接口**：`GET /v1/intent` 返回当前最可能的行动意图、驱动力、念头池与疲惫度。
- **可选模型**：支持任意 OpenAI-compatible Chat Completions API；默认关闭。
- **可选记忆源**：支持 Streamable HTTP MCP，通过可配置工具读取材料或写入梦境；默认关闭。
- **可选通知**：支持 Bark 推送、跨类型去重、冷却和每日上限；默认关闭。
- **安全默认值**：影子模式、认证 API、只读容器、最小权限和本机端口绑定。

## 架构

```text
Agent / 自动化
      |
      |  conversation-event / feedback / intent
      v
心潮状态机 ----> state.json
   |  |  |
   |  |  +---- 念头池、疲惫、意图
   |  +------- 可选 OpenAI-compatible 模型
   +---------- 可选 Memory MCP / Bark
```

心潮不代理模型请求，也不接管记忆库。它只维护一个可解释、可测试、可持久化的动态状态层。

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

## Docker Compose

```bash
cp .env.example .env
mkdir -p state memory-data
docker compose up -d --build
docker compose ps
```

Compose 默认只映射 `127.0.0.1:18110`，不会直接暴露到公网。若需要远程调用，请在前面增加你自己的反向代理、TLS 与访问控制。

## API

除 `/health` 外，所有接口都要求：

```http
Authorization: Bearer <SERVICE_TOKEN>
```

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/health` | 健康状态、运行模式和版本 |
| `GET` | `/v1/state` | 读取完整动态状态 |
| `GET` | `/v1/intent` | 读取当前意图、念头池与疲惫度 |
| `GET` | `/v1/breath-context` | 获取紧凑的近期梦境上下文 |
| `POST` | `/v1/settle` | 立即执行一次状态结算 |
| `POST` | `/v1/conversation-event` | 写入一次明确的对话/互动事件 |
| `POST` | `/v1/heartbeat` | 兼容的互动心跳入口 |
| `POST` | `/v1/drive-feedback` | 对指定驱动力增加或减少反馈 |

事件示例：

```bash
curl -X POST http://127.0.0.1:18110/v1/conversation-event \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"satisfiedDrives":["social"],"flashThoughts":[{"key":"curiosity","text":"继续研究这个问题","intensity":0.8}]}'
```

## 可选 Memory MCP

默认 `MEMORY_READ_ENABLED=false`、`MEMORY_WRITE_ENABLED=false`。启用前需要提供一个兼容 Streamable HTTP 的 MCP 地址，并配置读取/写入工具名：

```env
MEMORY_MCP_URL=http://your-memory-service/mcp
MEMORY_MCP_TOKEN=
MEMORY_READ_TOOL=breath
MEMORY_WRITE_TOOL=hold
```

读取工具应接受 `query`、`max_results`、`max_tokens`；写入工具应接受 `content`、`kind`、`pin`。如果你的 MCP 参数不同，可修改 `src/memory-client.js` 适配。

## 上线顺序

1. 保持 `SHADOW_MODE=true`，先观察状态与测试结果。
2. 配置并验证模型，再设置 `MODEL_ENABLED=true`。
3. 如需外部记忆，先只开 `MEMORY_READ_ENABLED=true`。
4. 最后再启用通知；写入记忆保持独立授权。

## 安全说明

- 不要提交 `.env`、`state/`、`memory-data/` 或任何真实 Token。
- 不要使用示例 `SERVICE_TOKEN` 上线。
- 服务默认只监听本机映射；不要未经鉴权直接暴露公网。
- `/v1/settle`、互动事件和反馈接口会修改状态；调用方应明确区分只读与写入操作。
- 日志不应记录认证头、模型密钥、通知密钥或私人记忆正文。

## 测试

```bash
npm test
```

测试覆盖驱动力结算、睡眠/醒来、念头池、疲惫、意图选择、梦境限频、通知去重、白天浮现与持久化。

## 项目结构

```text
src/                  核心状态机与适配器
test/                 Node.js 原生测试
configs/              可替换提示词
scripts/              配置、部署和烟雾测试
Dockerfile            只读最小容器
compose.yaml          本机安全默认部署
.env.example          完整配置模板
```

## License

[MIT](LICENSE)
