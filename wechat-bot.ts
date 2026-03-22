/**
 * wechat-bot.ts — Minimal WeChat AI Bot
 *
 * Connects to WeChat via QR code login, receives messages,
 * and replies using your AI logic.
 *
 * Usage:
 *   npm install
 *   npx tsx wechat-bot.ts              # Echo bot (no AI)
 *   npx tsx wechat-bot.ts --openai     # OpenAI-powered bot
 *
 * Environment variables (for --openai mode):
 *   OPENAI_API_KEY    — Your OpenAI API key
 *   OPENAI_MODEL      — Model name (default: gpt-4o)
 *   OPENAI_BASE_URL   — Custom base URL (for compatible APIs)
 */

import qrTerminal from 'qrcode-terminal'
import {
  getQrCode,
  waitForScan,
  getUpdates,
  sendMessage,
  extractText,
  SESSION_EXPIRED,
} from './wechat-api.js'

// ─── AI Handler ─────────────────────────────────────────────

type MessageHandler = (text: string) => Promise<string>

/** Simple echo handler (default) */
const echoHandler: MessageHandler = async (text) => {
  return `收到：${text}\n\n（这是回显模式。用 --openai 启动可接入 AI）`
}

/** OpenAI handler */
async function createOpenAIHandler(): Promise<MessageHandler> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  })
  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  // Per-user conversation history (simple in-memory)
  const histories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()

  return async (text: string) => {
    // Use a shared history for simplicity
    const key = 'default'
    const history = histories.get(key) || []
    history.push({ role: 'user', content: text })

    // Keep last 20 messages to avoid token overflow
    if (history.length > 20) history.splice(0, history.length - 20)

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: '你是一个有帮助的 AI 助手。用中文回复。' },
        ...history,
      ],
    })

    const reply = completion.choices[0]?.message?.content || '（无回复）'
    history.push({ role: 'assistant', content: reply })
    histories.set(key, history)
    return reply
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const useOpenAI = process.argv.includes('--openai')

  // Select handler
  let handler: MessageHandler
  if (useOpenAI) {
    console.log('🤖 OpenAI mode — using model:', process.env.OPENAI_MODEL || 'gpt-4o')
    handler = await createOpenAIHandler()
  } else {
    console.log('📢 Echo mode — messages will be echoed back')
    handler = echoHandler
  }

  // Step 1: Get QR code
  console.log('\n📱 Fetching QR code...')
  const qr = await getQrCode()
  qrTerminal.generate(qr.url, { small: true })
  console.log('\n👆 Scan this QR code with WeChat\n')

  // Step 2: Wait for scan
  let botToken = ''
  while (!botToken) {
    const result = await waitForScan(qr.qrcode)
    switch (result.status) {
      case 'confirmed':
        botToken = result.botToken!
        console.log(`✅ Login successful! User: ${result.userId}`)
        break
      case 'scaned':
        console.log('📲 Scanned — waiting for confirmation...')
        break
      case 'expired':
        console.error('❌ QR code expired. Please restart.')
        process.exit(1)
    }
  }

  // Step 3: Message loop
  console.log('\n💬 Listening for messages... (Ctrl+C to quit)\n')
  let cursor = ''

  while (true) {
    try {
      const updates = await getUpdates(botToken, cursor)

      // Handle errors
      if (updates.error) {
        if (updates.error === SESSION_EXPIRED) {
          console.error('❌ Session expired. Please restart and scan again.')
          process.exit(1)
        }
        console.error(`⚠️  API error: ${updates.error}`)
        await sleep(5000)
        continue
      }

      cursor = updates.cursor

      // Process messages
      for (const msg of updates.messages) {
        // Skip bot's own messages
        if (msg.message_type === 2) continue

        const text = extractText(msg)
        if (!text) continue

        const from = msg.from_user_id || ''
        console.log(`📩 [${from.slice(0, 12)}...] ${text}`)

        // Generate reply
        try {
          const reply = await handler(text)

          // Split long messages (WeChat limit ~4000 chars)
          const chunks = splitText(reply, 4000)
          for (const chunk of chunks) {
            await sendMessage(botToken, from, chunk, msg.context_token)
          }

          console.log(`📤 Replied: ${reply.slice(0, 60)}${reply.length > 60 ? '...' : ''}`)
        } catch (err) {
          console.error(`❌ Handler error:`, err)
          await sendMessage(botToken, from, '抱歉，处理消息时出错了。', msg.context_token)
        }
      }
    } catch (err) {
      console.error('❌ Message loop error:', err)
      await sleep(3000)
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLen)
    if (splitAt < maxLen / 2) splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen / 2) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

// ─── Run ────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
