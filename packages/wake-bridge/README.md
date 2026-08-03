# Wake Bridge Protocol

Wake Bridge 是心潮的独立、无依赖消息信封协议。它只定义“产生了什么、给谁看、何时过期、是否已经交付/消费”，不绑定 Bark、PWA、SSE、Webhook 或任何特定 AI。

当前支持四类产出：

- `dream_residue`：梦境产生的余韵；
- `longing_content`：思念或惦记形成的内容；
- `action_result`：自主行动的结果；
- `pending_from_me`：攒着等待说出口的内容。

用户与 AI 的 payload 分开，适配器不得把 `SERVICE_TOKEN`、Authorization、Cookie、原始 prompt 或整段聊天写入信封。传输和持久化由后续独立适配器实现。
