import { config } from '../config.mjs'
import { nowIso, run } from '../db/index.mjs'
import { publish } from './hub.mjs'
import { enqueueEmail } from './email-queue.mjs'

function channelsOf(payload) {
  const list = Array.isArray(payload.channels) ? payload.channels : []
  return list.length ? list : ['inpage', 'email']
}

export function dispatchAlert({ alert, payload }) {
  const channels = channelsOf(payload)
  const createdAt = nowIso()
  const body = JSON.stringify(payload)

  if (config.inpageEnabled && channels.includes('inpage')) {
    const result = run(
      `INSERT INTO notifications(alert_id, channel, status, attempts, payload_json, created_at, sent_at)
       VALUES(?, 'inpage', 'sent', 0, ?, ?, ?)`,
      alert.id,
      body,
      createdAt,
      createdAt
    )
    publish('alert.new', {
      ...payload,
      notificationId: Number(result.lastInsertRowid),
      toastMs: config.inpageToastMs,
      modalMinScore: config.inpageModalMinScore
    })
  }

  if (channels.includes('email')) {
    if (!config.mailEnabled) {
      run(
        `INSERT INTO notifications(alert_id, channel, status, attempts, last_error, payload_json, created_at)
         VALUES(?, 'email', 'skipped', 0, '邮件通道已关闭', ?, ?)`,
        alert.id,
        body,
        createdAt
      )
      return
    }
    const result = run(
      `INSERT INTO notifications(alert_id, channel, status, attempts, payload_json, created_at)
       VALUES(?, 'email', 'queued', 0, ?, ?)`,
      alert.id,
      body,
      createdAt
    )
    const priority = Boolean(payload.firstParty && payload.independentDomains >= 3)
    enqueueEmail(Number(result.lastInsertRowid), payload, { priority })
  }
}
