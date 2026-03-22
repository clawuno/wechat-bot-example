# 微信 AI Bot 示例

一个最小化的示例项目，展示如何将任意 AI 接入微信个人号。

约 200 行代码，无框架依赖，开箱即用。

## 快速开始

```bash
npm install
npx tsx wechat-bot.ts
```

终端会显示二维码，用微信扫码后即可开始对话。默认是回显模式（收到什么回什么）。

## 接入 AI 模型

支持任何 OpenAI 兼容的 API（OpenAI、DeepSeek、Qwen、Claude 等）：

```bash
# OpenAI
export OPENAI_API_KEY=sk-...
npx tsx wechat-bot.ts --openai

# DeepSeek
export OPENAI_API_KEY=your-key
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-chat
npx tsx wechat-bot.ts --openai

# 阿里云通义千问
export OPENAI_API_KEY=your-key
export OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export OPENAI_MODEL=qwen-plus
npx tsx wechat-bot.ts --openai
```

## 工作原理

1. **扫码登录** — 调用微信 API 获取二维码，用户扫码后获得 `bot_token`
2. **接收消息** — 长轮询 `getupdates` 端点（阻塞约 30 秒直到有新消息）
3. **发送回复** — POST 到 `sendmessage` 端点
4. **循环** — 回到第 2 步

就这么简单，四个 API 调用。

## 项目结构

```
wechat-api.ts   — 微信 API 封装（4 个函数，零依赖，可直接复制使用）
wechat-bot.ts   — Bot 主逻辑（回显模式 + OpenAI 模式）
```

## 限制

- 一个微信号同时只能接入一个 Bot
- `bot_token` 可能过期，需重新扫码（错误码 `-14`）
- 本示例仅处理文本消息（API 支持图片/语音/文件，但未在此实现）
- 对话历史仅保存在内存中，重启后丢失

## 许可

MIT
