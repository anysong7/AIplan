import { all, get, nowIso, run } from '../db/index.mjs'
import { config } from '../config.mjs'
import { loadEventItems } from './cluster.mjs'
import { canPush, computeEventMetrics, eventVerdict } from './scoring.mjs'
import { matchWatch, parseArray } from './keywords.mjs'
import { dispatchAlert } from '../notify/dispatcher.mjs'

const RANK = { suspicious: 0, unverified: 1, likely: 2, verified: 3 }

function hoursSince(iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 999
  return (Date.now() - t) / 3600000
}

function eventText(event, items) {
  return [event.title, event.summary, ...items.map((i) => `${i.title} ${i.excerpt || ''}`)]
    .filter(Boolean)
    .join(' ')
}

function previousAlert(eventId, kind, watchId, topicId) {
  return get(
    `SELECT * FROM alerts
     WHERE event_id = ? AND kind = ? AND IFNULL(watch_id, 0) = ? AND IFNULL(topic_id, 0) = ?
     ORDER BY id DESC LIMIT 1`,
    eventId,
    kind,
    watchId || 0,
    topicId || 0
  )
}

function createAlert({ event, items, metrics, kind, watch = null, topic = null, channels, label }) {
  const watchId = watch ? watch.id : null
  const topicId = topic ? topic.id : null
  const last = previousAlert(event.id, kind, watchId, topicId)
  const verdict = event.verdict

  if (last) {
    const upgraded = RANK[verdict] > RANK[last.verdict]
    if (!upgraded || hoursSince(last.created_at) < 1) return null
  }

  if (watchId) {
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const hourly = get(
      'SELECT COUNT(*) AS c FROM alerts WHERE watch_id = ? AND created_at >= ?',
      watchId,
      hourAgo
    )?.c
    const daily = get(
      'SELECT COUNT(*) AS c FROM alerts WHERE watch_id = ? AND created_at >= ?',
      watchId,
      dayAgo
    )?.c
    if (Number(hourly) >= config.alertMaxPerWatchPerHour) return null
    if (Number(daily) >= config.alertMaxPerWatchPerDay) return null
  }

  const result = run(
    `INSERT INTO alerts(event_id, watch_id, topic_id, kind, score, verdict, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    watchId,
    topicId,
    kind,
    metrics.credibility,
    verdict,
    nowIso()
  )
  const alert = get('SELECT * FROM alerts WHERE id = ?', Number(result.lastInsertRowid))
  const sources = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item.domain}|${item.canonical_url}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push({
      title: item.title,
      url: item.canonical_url,
      domain: item.domain,
      platform: item.platform,
      firstParty: Boolean(item.is_first_party),
      publishedAt: item.published_at,
      sourceName: item.source_name
    })
  }

  const payload = {
    alertId: alert.id,
    eventId: event.id,
    title: event.title,
    summary: event.summary,
    score: Number(metrics.credibility.toFixed(3)),
    verdict,
    credibility: Number(metrics.credibility.toFixed(3)),
    heat: Number(metrics.heat.toFixed(3)),
    independentDomains: metrics.independentDomains,
    rumor: metrics.rumor,
    firstParty: metrics.firstParty,
    target: label,
    kind,
    channels,
    sources: sources.slice(0, 8),
    createdAt: alert.created_at,
    readUrl: `${config.baseUrl}/#/event/${event.id}`
  }

  dispatchAlert({ alert, payload })
  return alert
}

export function evaluateAlerts(eventId) {
  const event = get('SELECT * FROM events WHERE id = ?', eventId)
  if (!event) return []
  const items = loadEventItems(eventId)
  if (!items.length) return []
  const metrics = computeEventMetrics(
    items,
    new Map(items.map((i) => [i.source_id, { kind: i.source_kind, weight: i.source_weight }]))
  )
  const verdict = eventVerdict(metrics)
  if (verdict !== event.verdict) {
    run('UPDATE events SET verdict = ? WHERE id = ?', verdict, eventId)
    event.verdict = verdict
  }

  const text = eventText(event, items)
  const created = []

  for (const watch of all('SELECT * FROM watches WHERE enabled = 1')) {
    const matched = matchWatch(text, watch).matched
    if (!matched) continue
    if (!canPush(metrics, watch.min_credibility, config.pushMinDomains)) continue
    const channels = parseArray(watch.channels, ['inpage', 'email'])
    const alert = createAlert({
      event,
      items,
      metrics,
      kind: 'watch',
      watch,
      channels,
      label: watch.keyword
    })
    if (alert) created.push(alert)
  }

  return created
}

export function backfillWatch(watch, { hours = 24, limit = 10 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const events = all(
    `SELECT id, title, summary FROM events
     WHERE last_updated_at >= ?
     ORDER BY heat DESC, last_updated_at DESC LIMIT 200`,
    since
  )
  let count = 0
  for (const event of events) {
    if (!matchWatch(`${event.title} ${event.summary || ''}`, watch).matched) continue
    const created = evaluateAlerts(event.id).filter((alert) => alert.watch_id === watch.id)
    count += created.length
    if (count >= limit) break
  }
  return count
}
