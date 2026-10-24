import express from 'express'
import fs from 'node:fs'
import { config, masked } from '../config.mjs'
import { all, get, nowIso, run, setSetting, getSetting } from '../db/index.mjs'
import { eventDetails } from '../core/pipeline.mjs'
import { matchTopic } from '../core/keywords.mjs'
import { backfillWatch } from '../core/alerts.mjs'
import { getJob, runScanNow, startScan, schedulerState } from '../scheduler/scheduler.mjs'
import { subscribe } from '../notify/hub.mjs'
import { pendingEmailCount, flushEmailQueue } from '../notify/email-queue.mjs'
import { buildEmail } from '../notify/email-template.mjs'
import { mailPreviewPath, sendMail, verifyMail } from '../notify/mail.mjs'
import { collectForSource } from '../collectors/index.mjs'
import { ingestRawItems } from '../core/pipeline.mjs'
import { todayUsage } from '../db/index.mjs'

export const api = express.Router()

const ok = (res, data) => res.json(data)

function parseSince(value, fallbackHours = 72) {
  if (!value) return new Date(Date.now() - fallbackHours * 3600 * 1000).toISOString()
  if (/^\d+[hd]$/.test(value)) {
    const amount = Number(value.slice(0, -1))
    const hours = value.endsWith('d') ? amount * 24 : amount
    return new Date(Date.now() - hours * 3600 * 1000).toISOString()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? new Date(Date.now() - fallbackHours * 3600 * 1000).toISOString()
    : date.toISOString()
}

function sourcesForEvent(eventId, limit = 6) {
  return all(
    `SELECT i.title, i.canonical_url AS url, i.domain, i.platform, i.is_first_party,
            i.published_at, s.name AS sourceName
     FROM items i JOIN event_items ei ON ei.item_id = i.id
     JOIN sources s ON s.id = i.source_id
     WHERE ei.event_id = ? ORDER BY i.is_first_party DESC, i.published_at ASC LIMIT ?`,
    eventId,
    limit
  )
}

api.get('/status', (_req, res) => {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const counts = {
    events: get('SELECT COUNT(*) AS c FROM events')?.c || 0,
    events24h: get('SELECT COUNT(*) AS c FROM events WHERE last_updated_at >= ?', since24)?.c || 0,
    unread: get('SELECT COUNT(*) AS c FROM alerts WHERE read_at IS NULL')?.c || 0,
    watches: get('SELECT COUNT(*) AS c FROM watches WHERE enabled = 1')?.c || 0,
    pendingEmail: pendingEmailCount()
  }
  const sources = all('SELECT kind, name, health, enabled, last_fetch_at, fail_count FROM sources')
  const health = sources.reduce((acc, s) => {
    const key = s.enabled ? s.health : 'disabled'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  res.json({
    ok: true,
    version: '0.1.0',
    uptimeSec: Math.round(process.uptime()),
    now: nowIso(),
    baseUrl: config.baseUrl,
    scanIntervalSec: config.scanIntervalSec,
    verifyMode: config.verifyMode,
    aiEnabled: config.aiEnabled,
    xEnabled: config.xEnabled,
    gdeltEnabled: config.gdeltEnabled,
    mail: { enabled: config.mailEnabled, transport: config.mailTransport, to: config.mailTo },
    scheduler: schedulerState(),
    counts,
    health,
    sources
  })
})

api.get('/hotspots', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const since = parseSince(req.query.since, 72)
  const minCredibility = Number(req.query.minCredibility ?? 0)
  const platform = req.query.platform
  const q = String(req.query.q || '').trim()
  const includeSuspicious = req.query.includeSuspicious === '1'

  let rows = all(
    `SELECT * FROM events WHERE last_updated_at >= ? AND credibility >= ?
     ${includeSuspicious ? '' : "AND verdict != 'suspicious'"}
     ${q ? 'AND (title LIKE ? OR summary LIKE ?)' : ''}
     ORDER BY heat DESC, last_updated_at DESC LIMIT 400`,
    ...[since, minCredibility, ...(q ? [`%${q}%`, `%${q}%`] : [])]
  )

  if (req.query.topic) {
    const topic = get('SELECT * FROM topics WHERE name = ?', req.query.topic)
    if (topic) {
      rows = rows.filter((event) =>
        matchTopic(`${event.title} ${event.summary || ''}`, topic).matched
      )
    } else {
      rows = []
    }
  }

  if (platform) {
    rows = rows.filter((event) => sourcesForEvent(event.id, 20).some((s) => s.platform === platform))
  }

  const total = rows.length
  const page = rows.slice(offset, offset + limit).map((event) => ({
    ...event,
    sources: sourcesForEvent(event.id, 4)
  }))
  res.json({ items: page, total, limit, offset })
})

api.get('/events/:id', (req, res) => {
  const details = eventDetails(Number(req.params.id))
  if (!details) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: '事件不存在' } })
  }
  const alert = get(
    'SELECT * FROM alerts WHERE event_id = ? ORDER BY id DESC LIMIT 1',
    details.event.id
  )
  res.json({ ...details, alert })
})

function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

api.get('/watches', (_req, res) => {
  const rows = all('SELECT * FROM watches ORDER BY created_at DESC').map((watch) => {
    const stats = get(
      `SELECT COUNT(*) AS hits, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
       FROM alerts WHERE watch_id = ?`,
      watch.id
    )
    return { ...watch, hits: Number(stats?.hits || 0), unread: Number(stats?.unread || 0) }
  })
  res.json({ items: rows })
})

api.post('/watches', (req, res, next) => {
  try {
    const body = req.body || {}
    const keyword = String(body.keyword || '').trim()
    if (!keyword) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'keyword 不能为空' } })
    }
    const aliases = normalizeList(body.aliases)
    const excludes = normalizeList(body.excludeTerms ?? body.exclude_terms)
    const minCredibility = Math.min(
      1,
      Math.max(0, Number(body.minCredibility ?? config.pushMinCredibility))
    )
    const intervalSec = Math.max(300, Number(body.intervalSec || config.scanIntervalSec))
    const channels = normalizeList(body.channels).length
      ? normalizeList(body.channels)
      : ['inpage', 'email']

    const result = run(
      `INSERT INTO watches(keyword, aliases, exclude_terms, topic_id, min_credibility,
         interval_sec, channels, enabled, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      keyword,
      JSON.stringify(aliases),
      JSON.stringify(excludes),
      body.topicId ? Number(body.topicId) : null,
      minCredibility,
      intervalSec,
      JSON.stringify(channels),
      nowIso()
    )
    const watch = get('SELECT * FROM watches WHERE id = ?', Number(result.lastInsertRowid))
    backfillWatch(watch)
    res.status(201).json({ ok: true, watch })
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: '该关键词已存在' } })
    }
    next(error)
  }
})

api.patch('/watches/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const watch = get('SELECT * FROM watches WHERE id = ?', id)
    if (!watch) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '监控不存在' } })
    }
    const body = req.body || {}
    const fields = []
    const values = []
    if (body.keyword !== undefined) {
      fields.push('keyword = ?')
      values.push(String(body.keyword).trim())
    }
    if (body.aliases !== undefined) {
      fields.push('aliases = ?')
      values.push(JSON.stringify(normalizeList(body.aliases)))
    }
    if (body.excludeTerms !== undefined || body.exclude_terms !== undefined) {
      fields.push('exclude_terms = ?')
      values.push(JSON.stringify(normalizeList(body.excludeTerms ?? body.exclude_terms)))
    }
    if (body.minCredibility !== undefined) {
      fields.push('min_credibility = ?')
      values.push(Math.min(1, Math.max(0, Number(body.minCredibility))))
    }
    if (body.intervalSec !== undefined) {
      fields.push('interval_sec = ?')
      values.push(Math.max(300, Number(body.intervalSec)))
    }
    if (body.channels !== undefined) {
      fields.push('channels = ?')
      values.push(JSON.stringify(normalizeList(body.channels)))
    }
    if (body.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(body.enabled ? 1 : 0)
    }
    if (!fields.length) return res.json({ ok: true, watch })
    run(`UPDATE watches SET ${fields.join(', ')} WHERE id = ?`, ...values, id)
    res.json({ ok: true, watch: get('SELECT * FROM watches WHERE id = ?', id) })
  } catch (error) {
    next(error)
  }
})

api.delete('/watches/:id', (req, res) => {
  run('DELETE FROM watches WHERE id = ?', Number(req.params.id))
  res.json({ ok: true })
})

api.get('/watches/:id/matches', (req, res) => {
  const rows = all(
    `SELECT a.*, e.title, e.summary, e.credibility, e.verdict, e.heat
     FROM alerts a JOIN events e ON e.id = a.event_id
     WHERE a.watch_id = ? ORDER BY a.created_at DESC LIMIT 100`,
    Number(req.params.id)
  )
  res.json({ items: rows })
})

api.get('/topics', (_req, res) => {
  res.json({ items: all('SELECT * FROM topics ORDER BY id ASC') })
})

api.post('/topics', (req, res) => {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'name 不能为空' } })
  }
  const queries = normalizeList(body.queries)
  run(
    `INSERT INTO topics(name, queries, source_kinds, interval_sec, min_credibility, enabled, last_scan_at)
     VALUES(?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(name) DO UPDATE SET
       queries = excluded.queries, source_kinds = excluded.source_kinds,
       interval_sec = excluded.interval_sec, min_credibility = excluded.min_credibility,
       enabled = excluded.enabled`,
    name,
    JSON.stringify(queries),
    JSON.stringify(normalizeList(body.sourceKinds)),
    Math.max(300, Number(body.intervalSec || config.scanIntervalSec)),
    Math.min(1, Math.max(0, Number(body.minCredibility ?? config.pushMinCredibility))),
    body.enabled === false ? 0 : 1
  )
  const topic = get('SELECT * FROM topics WHERE name = ?', name)
  res.status(201).json({ ok: true, topic })
})

api.patch('/topics/:id', (req, res) => {
  const id = Number(req.params.id)
  const topic = get('SELECT * FROM topics WHERE id = ?', id)
  if (!topic) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topic 不存在' } })
  }
  const body = req.body || {}
  const fields = []
  const values = []
  if (body.queries !== undefined) {
    fields.push('queries = ?')
    values.push(JSON.stringify(normalizeList(body.queries)))
  }
  if (body.intervalSec !== undefined) {
    fields.push('interval_sec = ?')
    values.push(Math.max(300, Number(body.intervalSec)))
  }
  if (body.minCredibility !== undefined) {
    fields.push('min_credibility = ?')
    values.push(Math.min(1, Math.max(0, Number(body.minCredibility))))
  }
  if (body.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(body.enabled ? 1 : 0)
  }
  if (fields.length) {
    run(`UPDATE topics SET ${fields.join(', ')} WHERE id = ?`, ...values, id)
  }
  res.json({ ok: true, topic: get('SELECT * FROM topics WHERE id = ?', id) })
})

api.get('/alerts', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true'
  const rows = all(
    `SELECT a.*, e.title, e.summary, e.credibility, e.verdict, e.heat,
            e.independent_domains, e.last_updated_at
     FROM alerts a JOIN events e ON e.id = a.event_id
     ${unreadOnly ? 'WHERE a.read_at IS NULL' : ''}
     ORDER BY a.created_at DESC LIMIT ?`,
    limit
  )
  res.json({ items: rows })
})

api.post('/alerts/:id/read', (req, res) => {
  run(
    'UPDATE alerts SET read_at = ? WHERE id = ? AND read_at IS NULL',
    nowIso(),
    Number(req.params.id)
  )
  res.json({ ok: true })
})

api.post('/alerts/read-all', (_req, res) => {
  run('UPDATE alerts SET read_at = ? WHERE read_at IS NULL', nowIso())
  res.json({ ok: true })
})

api.post('/scan', async (req, res, next) => {
  try {
    const scope = String(req.body?.scope || 'all')
    if (req.body?.wait) {
      const job = await runScanNow(scope)
      return res.json({ ok: true, job })
    }
    const job = startScan(scope)
    res.status(202).json({ ok: true, jobId: job.id, job })
  } catch (error) {
    next(error)
  }
})

api.get('/scan/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } })
  res.json({ ok: true, job })
})

api.get('/sources', (_req, res) => {
  const rows = all('SELECT * FROM sources ORDER BY kind, name').map((source) => ({
    ...source,
    usage: todayUsage(source.kind)
  }))
  res.json({ items: rows })
})

api.patch('/sources/:id', (req, res) => {
  const id = Number(req.params.id)
  const source = get('SELECT * FROM sources WHERE id = ?', id)
  if (!source) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '源不存在' } })
  const body = req.body || {}
  const fields = []
  const values = []
  if (body.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(body.enabled ? 1 : 0)
  }
  if (body.weight !== undefined) {
    fields.push('weight = ?')
    values.push(Math.min(1, Math.max(0, Number(body.weight))))
  }
  if (fields.length) run(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`, ...values, id)
  res.json({ ok: true, source: get('SELECT * FROM sources WHERE id = ?', id) })
})

api.get('/usage', (_req, res) => {
  const rows = all(
    'SELECT source, day, calls, units, cost_usd FROM source_usage ORDER BY day DESC, source ASC LIMIT 200'
  )
  res.json({ items: rows })
})

api.get('/notifications', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const rows = all(
    `SELECT n.*, a.event_id, e.title
     FROM notifications n
     LEFT JOIN alerts a ON a.id = n.alert_id
     LEFT JOIN events e ON e.id = a.event_id
     ORDER BY n.id DESC LIMIT ?`,
    limit
  )
  res.json({
    items: rows.map((row) => ({
      ...row,
      payload_json: undefined
    }))
  })
})

api.get('/settings', (_req, res) => {
  res.json({
    ok: true,
    config: {
      scanIntervalSec: config.scanIntervalSec,
      pushMinCredibility: config.pushMinCredibility,
      pushMinDomains: config.pushMinDomains,
      verifyMode: config.verifyMode,
      aiEnabled: config.aiEnabled,
      xEnabled: config.xEnabled,
      gdeltEnabled: config.gdeltEnabled,
      inpageEnabled: config.inpageEnabled,
      inpageToastMs: config.inpageToastMs,
      inpageModalMinScore: config.inpageModalMinScore,
      inpageSound: config.inpageSound,
      mailEnabled: config.mailEnabled,
      mailTransport: config.mailTransport,
      mailTo: config.mailTo,
      mailMergeWindowSec: config.mailMergeWindowSec,
      mailQuietHours: config.mailQuietHours,
      mailMaxPerHour: config.mailMaxPerHour,
      mailMaxPerDay: config.mailMaxPerDay
    },
    secrets: {
      openrouter: masked(config.openrouterApiKey),
      twitterapi: masked(config.twitterApiKey),
      smtpPass: masked(config.smtp.pass),
      github: masked(config.githubToken)
    },
    mail: awaitSafeMail()
  })
})

function awaitSafeMail() {
  return { transport: config.mailTransport, to: config.mailTo, from: config.mailFrom }
}

api.patch('/settings', (req, res) => {
  const body = req.body || {}
  const overrides = getSetting('overrides', {}) || {}
  const numeric = ['pushMinCredibility', 'pushMinDomains', 'inpageToastMs', 'inpageModalMinScore']
  for (const key of numeric) {
    if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
      const value = Number(body[key])
      config[key] = key.startsWith('pushMin') && key !== 'pushMinDomains'
        ? Math.min(1, Math.max(0, value))
        : Math.max(0, value)
      overrides[key] = config[key]
    }
  }
  if (body.mailQuietHours !== undefined) {
    config.mailQuietHours = String(body.mailQuietHours || '')
    overrides.mailQuietHours = config.mailQuietHours
  }
  if (body.inpageSound !== undefined) {
    config.inpageSound = Boolean(body.inpageSound)
    overrides.inpageSound = config.inpageSound
  }
  setSetting('overrides', overrides)
  res.json({ ok: true, overrides })
})

const testEmailHits = []

api.post('/test/email', async (req, res, next) => {
  try {
    const nowMs = Date.now()
    while (testEmailHits.length && nowMs - testEmailHits[0] > 60000) testEmailHits.shift()
    if (testEmailHits.length >= 3) {
      return res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: '测试邮件过于频繁，请稍后再试' } })
    }
    testEmailHits.push(nowMs)

    if (!config.mailEnabled) {
      return res
        .status(400)
        .json({ error: { code: 'MAIL_DISABLED', message: '邮件通道已关闭' } })
    }

    const payload = {
      title: '这是一封来自 SIGNAL 的测试邮件',
      summary: '如果你能看到这封邮件，说明 SMTP 连接、模板渲染与投递链路都正常。真实告警会包含来源与可信度。',
      credibility: 0.9,
      independentDomains: 2,
      verdict: 'verified',
      target: '测试',
      sources: [
        {
          title: 'SIGNAL 本地',
          url: config.baseUrl,
          domain: 'localhost',
          firstParty: true
        }
      ],
      readUrl: `${config.baseUrl}/#/settings`
    }
    const mail = buildEmail([payload])
    const info = await sendMail(mail)
    run(
      `INSERT INTO notifications(alert_id, channel, status, attempts, preview_url, payload_json, created_at, sent_at)
       VALUES(NULL, 'email', 'sent', 1, ?, ?, ?, ?)`,
      info.previewUrl,
      JSON.stringify(payload),
      nowIso(),
      nowIso()
    )
    res.json({ ok: true, ...info })
  } catch (error) {
    next(error)
  }
})

api.post('/test/source', async (req, res, next) => {
  try {
    const source = get('SELECT * FROM sources WHERE id = ?', Number(req.body?.id))
    if (!source) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '源不存在' } })
    }
    const result = await collectForSource(source, { query: req.body?.query })
    const items = result.items || []
    const inserted = ingestRawItems(source, items)
    res.json({ ok: true, fetched: items.length, inserted: inserted.length, sample: items.slice(0, 3) })
  } catch (error) {
    next(error)
  }
})

api.post('/feedback', (req, res) => {
  const body = req.body || {}
  if (!body.verdict) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'verdict 不能为空' } })
  }
  run(
    'INSERT INTO feedback(item_id, verdict, note, created_at) VALUES(?, ?, ?, ?)',
    body.itemId ? Number(body.itemId) : null,
    String(body.verdict),
    body.note ? String(body.note) : null,
    nowIso()
  )
  res.json({ ok: true })
})

api.get('/stream', (req, res) => {
  const unread = get('SELECT COUNT(*) AS c FROM alerts WHERE read_at IS NULL')?.c || 0
  subscribe(req, res, { unread: Number(unread) })
})

api.get('/mail-preview/:name', (req, res) => {
  const file = mailPreviewPath(req.params.name)
  if (!file) return res.status(404).send('not found')
  if (req.params.name.endsWith('.html')) return res.type('text/html; charset=utf-8').sendFile(file)
  res.type('message/rfc822').sendFile(file)
})

api.get('/mail/verify', async (_req, res) => {
  res.json(await verifyMail())
})

api.post('/mail/flush', async (_req, res) => {
  res.json(await flushEmailQueue({ force: true }))
})




