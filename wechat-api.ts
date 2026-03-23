/**
 * WeChat Bot API Client
 *
 * Wraps the ilink bot API for WeChat personal account integration.
 * Four endpoints: getQrCode, waitForScan, getUpdates, sendMessage.
 *
 * API interface based on analysis of @tencent-weixin/openclaw-weixin (MIT License).
 * Copyright (c) 2026 Tencent Inc.
 */

const BASE_URL = 'https://ilinkai.weixin.qq.com'
const LONG_POLL_TIMEOUT = 35_000

// ─── Types ──────────────────────────────────────────────────

export interface WeixinMessage {
  from_user_id?: string
  to_user_id?: string
  message_type?: number // 1=User, 2=Bot
  item_list?: Array<{
    type: number // 1=Text, 2=Image, 3=Voice, 4=File, 5=Video
    text_item?: { text?: string }
    voice_item?: { text?: string } // voice-to-text
  }>
  context_token?: string
  create_time_ms?: number
}

// ─── Auth Headers ───────────────────────────────────────────

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

// ─── 1. Get QR Code ─────────────────────────────────────────

export async function getQrCode(): Promise<{
  qrcode: string
  url: string
}> {
  const res = await fetch(`${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`)
  const data = await res.json() as { qrcode: string; qrcode_img_content: string }
  return { qrcode: data.qrcode, url: data.qrcode_img_content }
}

// ─── 2. Wait for Scan (long-poll) ───────────────────────────

export async function waitForScan(qrcode: string): Promise<{
  status: 'wait' | 'scaned' | 'confirmed' | 'expired'
  botToken?: string
  botId?: string
  userId?: string
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT)
  try {
    const res = await fetch(
      `${BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      { headers: { 'iLink-App-ClientVersion': '1' }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json() as {
      status: 'wait' | 'scaned' | 'confirmed' | 'expired'
      bot_token?: string
      ilink_bot_id?: string
      ilink_user_id?: string
    }
    return {
      status: data.status,
      botToken: data.bot_token,
      botId: data.ilink_bot_id,
      userId: data.ilink_user_id,
    }
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') return { status: 'wait' }
    throw err
  }
}

// ─── 3. Get Updates (long-poll) ─────────────────────────────

export async function getUpdates(token: string, cursor: string): Promise<{
  messages: WeixinMessage[]
  cursor: string
  error?: number
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT)
  try {
    const res = await fetch(`${BASE_URL}/ilink/bot/getupdates`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        get_updates_buf: cursor,
        base_info: { channel_version: 'wechat-bot-example-1.0' },
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json() as {
      ret?: number; errcode?: number
      msgs?: WeixinMessage[]
      get_updates_buf?: string
    }
    return {
      messages: data.msgs || [],
      cursor: data.get_updates_buf || cursor,
      error: (data.ret && data.ret !== 0) ? data.ret : (data.errcode && data.errcode !== 0) ? data.errcode : undefined,
    }
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') return { messages: [], cursor }
    throw err
  }
}

// ─── 4. Send Message ────────────────────────────────────────

export async function sendMessage(
  token: string,
  to: string,
  text: string,
  contextToken?: string,
): Promise<void> {
  await fetch(`${BASE_URL}/ilink/bot/sendmessage`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      msg: {
        from_user_id: '',
        to_user_id: to,
        client_id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message_type: 2, // Bot
        message_state: 2, // Finished
        item_list: [{ type: 1, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: { channel_version: 'wechat-bot-example-1.0' },
    }),
  })
}

// ─── Helpers ────────────────────────────────────────────────

/** Extract text from a WeChat message */
export function extractText(msg: WeixinMessage): string {
  return (msg.item_list || [])
    .map(item => item.text_item?.text || item.voice_item?.text || '')
    .join('')
    .trim()
}

/** Session expired error code */
export const SESSION_EXPIRED = -14
