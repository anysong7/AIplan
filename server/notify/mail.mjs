import fs from 'node:fs'
import path from 'node:path'
import nodemailer from 'nodemailer'
import { config } from '../config.mjs'
import { getSetting, setSetting } from '../db/index.mjs'

let cached = null

function streamDir() {
  const dir = path.join(config.root, 'data', 'mail-preview')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function streamTransport() {
  return nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix'
  })
}

async function buildTransport() {
  const mode = config.mailTransport
  if (mode === 'smtp') {
    if (!config.smtp.host) throw new Error('SMTP_HOST 未配置')
    return {
      mode,
      transporter: nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: config.smtp.user
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined
      })
    }
  }

  if (mode === 'stream') {
    return { mode, transporter: streamTransport() }
  }

  try {
    let account = getSetting('ethereal_account')
    if (!account?.user) {
      const created = await nodemailer.createTestAccount()
      account = {
        user: created.user,
        pass: created.pass,
        host: created.smtp.host,
        port: created.smtp.port,
        secure: created.smtp.secure,
        web: created.web
      }
      setSetting('ethereal_account', account)
    }
    return {
      mode: 'ethereal',
      transporter: nodemailer.createTransport({
        host: account.host,
        port: account.port,
        secure: account.secure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: { user: account.user, pass: account.pass }
      })
    }
  } catch {
    // Ethereal 不可达时降级为本地 .eml + HTML 预览，保证通知链路可用
    return { mode: 'stream', transporter: streamTransport() }
  }
}

async function getTransport(force = false) {
  if (force || !cached) {
    cached = await buildTransport()
  }
  return cached
}

export async function sendMail({ subject, html, text }) {
  let attempt = 0
  let fallbackUsed = false
  while (attempt < 2) {
    attempt += 1
    let mode = null
    try {
      const transport = await getTransport(attempt > 1)
      mode = transport.mode
      const info = await transport.transporter.sendMail({
        from: config.mailFrom,
        to: config.mailTo,
        subject,
        text,
        html,
        headers: { 'X-SIGNAL-Radar': '1' }
      })

      let previewUrl = nodemailer.getTestMessageUrl(info) || null
      if (mode === 'stream' && info.message) {
        const name = `mail-${Date.now()}`
        fs.writeFileSync(path.join(streamDir(), `${name}.eml`), info.message)
        fs.writeFileSync(path.join(streamDir(), `${name}.html`), html)
        previewUrl = `${config.baseUrl}/api/mail-preview/${name}.html`
      }

      return {
        previewUrl,
        messageId: info.messageId || null,
        mode,
        response: info.response || '',
        fallback: fallbackUsed
      }
    } catch (err) {
      if (mode === 'ethereal' && !fallbackUsed) {
        // SMTP 被网络拦截时，本次及后续直接降级为本地 HTML 预览
        fallbackUsed = true
        cached = { mode: 'stream', transporter: streamTransport() }
        attempt = 0
        continue
      }
      cached = null
      if (attempt >= 2) throw err
    }
  }
  throw new Error('邮件发送失败')
}

export async function verifyMail() {
  try {
    const { transporter, mode } = await getTransport()
    if (mode === 'smtp') await transporter.verify()
    return { ok: true, mode }
  } catch (err) {
    return { ok: false, mode: config.mailTransport, error: err.message }
  }
}

export function mailPreviewPath(name) {
  if (!/^mail-\d+\.(eml|html)$/.test(name)) return null
  const file = path.join(streamDir(), name)
  if (!fs.existsSync(file)) return null
  return file
}
