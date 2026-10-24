import { config } from '../config.mjs'
import { get, nowIso, run } from '../db/index.mjs'
import { publish } from './hub.mjs'
import { buildEmail } from './email-template.mjs'
import { sendMail } from './mail.mjs'

const pending = new Map()
let timer = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function startOfDay() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function sentCount(since) {
  const row = get(
    `SELECT COUNT(*) AS c FROM notifications
     WHERE channel = 'email' AND status = 'sent' AND sent_at >= ?`,
    since
  )
  return Number(row?.c || 0)
}

function quietRange() {
  const raw = config.mailQuietHours
  if (!raw || !raw.includes('-')) return null
  const [start, end] = raw.split('-')
  const parse = (value) => {
    const [h, m] = value.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const s = parse(start)
  const e = parse(end)
  if (s === null || e === null) return null
  return { start: s, end: e }
}

function isQuietNow() {
  const range = quietRange()
  if (!range) return false
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (range.start <= range.end) return minutes >= range.start && minutes < range.end
  return minutes >= range.start || minutes < range.end
}

function msUntilQuietEnd() {
  const range = quietRange()
  if (!range) return 0
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  let diff = range.end - minutes
  if (diff <= 0) diff += 24 * 60
  return diff * 60 * 1000
}

function schedule(delayMs = config.mailMergeWindowSec * 1000) {
  if (timer || pending.size === 0) return
  timer = setTimeout(() => {
    timer = null
    flushEmailQueue().catch(() => {})
  }, Math.max(1000, delayMs))
  timer.unref?.()
}

export function enqueueEmail(notificationId, payload, { priority = false } = {}) {
  pending.set(notificationId, payload)
  if (priority) {
    flushEmailQueue().catch(() => {})
  } else {
    schedule()
  }
}

function mark(notificationId, status, patch = {}) {
  run(
    `UPDATE notifications SET status = ?, attempts = COALESCE(?, attempts),
       last_error = COALESCE(?, last_error), preview_url = COALESCE(?, preview_url),
       sent_at = COALESCE(?, sent_at) WHERE id = ?`,
    status,
    patch.attempts ?? null,
    patch.error ?? null,
    patch.previewUrl ?? null,
    patch.sentAt ?? null,
    notificationId
  )
  publish('notification.update', {
    id: notificationId,
    channel: 'email',
    status,
    previewUrl: patch.previewUrl || null,
    error: patch.error || null
  })
}

export async function flushEmailQueue({ force = false } = {}) {
  if (pending.size === 0) return { sent: 0, failed: 0, skipped: 0 }

  if (!force && isQuietNow()) {
    schedule(msUntilQuietEnd())
    return { sent: 0, failed: 0, skipped: 0, quiet: true }
  }

  if (sentCount(startOfDay()) >= config.mailMaxPerDay) {
    for (const id of pending.keys()) {
      mark(id, 'skipped', { error: '达到每日邮件上限' })
    }
    pending.clear()
    return { sent: 0, failed: 0, skipped: 1, reason: 'daily-limit' }
  }

  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
  if (sentCount(hourAgo) >= config.mailMaxPerHour) {
    schedule(15 * 60 * 1000)
    return { sent: 0, failed: 0, skipped: 0, reason: 'hourly-limit' }
  }

  const entries = [...pending.entries()].slice(0, 20)
  for (const [id] of entries) pending.delete(id)
  for (const [id] of entries) mark(id, 'sending')

  const payloads = entries.map(([, payload]) => payload)
  const mail = buildEmail(payloads)

  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const info = await sendMail(mail)
      const sentAt = nowIso()
      for (const [id] of entries) {
        mark(id, 'sent', { previewUrl: info.previewUrl, sentAt, attempts: attempt })
      }
      if (pending.size) schedule()
      return { sent: entries.length, failed: 0, skipped: 0, previewUrl: info.previewUrl, mode: info.mode }
    } catch (err) {
      lastError = err
      if (attempt < 3) await sleep(attempt === 1 ? 1000 : 3000)
    }
  }

  for (const [id] of entries) {
    mark(id, 'failed', { error: lastError?.message || '发送失败', attempts: 3 })
  }
  if (pending.size) schedule()
  return { sent: 0, failed: entries.length, skipped: 0, error: lastError?.message }
}

export function pendingEmailCount() {
  return pending.size
}

export function resetMailQueue() {
  pending.clear()
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
