# 心潮 2.0 架构

## 设计目标

心潮把“对话生成”与“持续状态”拆开。语言模型、AI 客户端和用户设备可以随时替换，而驱动力、念头池、疲惫、睡眠与意图保存在独立状态机中。

## 平台无关边界

核心对外只暴露经 Bearer Token 保护的 HTTP/JSON API，不依赖 Claude、Anthropic 或某个特定终端的会话格式。桌面 AI 客户端、命令行、手机自动化、VPS 与其他 Agent 可以共用同一个心潮实例；各端只负责把自身事件转换为标准 API 请求。

不具备直接 HTTP 调用能力的客户端需要脚本、Webhook、插件或其他协议适配器。这些适配器属于接入层，不改变核心状态机。

## 核心数据流

```text
conversation event / heartbeat / feedback
                    |
                    v
            deterministic state engine
              /       |        \
        thought pool fatigue   drives
              \       |        /
                 pickIntent
                    |
                    v
         model / memory / notification
              (all optional)
```

上图的事件入口可以同时来自多个设备终端。`StateStore` 串行化并发更新，并通过原子替换保持状态文件完整。

## 状态结算

`settleState` 根据上次结算时间计算经过时长：

1. 驱动力按各自速率增长，并受夜间倍率、清晨冻结与饱和区间限制。
2. 念头池中的闪念按时间衰减；反复主题形成执念加权。
3. 疲惫度随持续清醒时间增长，互动事件会改变部分状态。
4. 空闲超过阈值后进入睡眠；重复结算保持幂等。

## 意图选择

`pickIntent` 先找出最高驱动力附近的候选集合，再用驱动力值与念头池执念加权进行选择。接口同时返回可解释的 `key`、`label` 和 `value`。

## 外部适配器

- `ModelClient`：OpenAI-compatible Chat Completions API。
- `MemoryClient`：Streamable HTTP MCP，工具名可配置。
- `BarkClient`：可选手机通知。

适配器失败不会替代核心状态机；影子模式下所有外部读写和通知都关闭。

## 持久化

`StateStore` 使用临时文件加原子替换写入 JSON。容器部署将 `/app/state` 映射到宿主机，升级镜像不会删除状态。

## 安全边界

- API 使用固定时间比较验证 Bearer Token。
- 请求体限制为 64 KiB。
- Docker 默认只映射回环地址、只读根文件系统并移除 Linux capabilities。
- 所有外部集成默认关闭，写入记忆与发送通知必须单独启用。
