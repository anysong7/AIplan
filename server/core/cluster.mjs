import { all, get, nowIso, run, transaction } from '../db/index.mjs'
import { eventKey, titleSimilarity } from './dedupe.mjs'
import {
  computeEventMetrics,
  eventSummary,
  eventTitle,
  eventVerdict
} from './scoring.mjs'

export function findSimilarEvent(title, hours = 72) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const rows = all(
    `SELECT id, title, event_key, credibility FROM events
     WHERE last_updated_at >= ?
     ORDER BY last_updated_at DESC
     LIMIT 300`,
    since
  )
  let best = null
  let bestScore = 0
  for (const row of rows) {
    const score = titleSimilarity(title, row.title)
    if (score >= 0.82 && score > bestScore) {
      best = row
      bestScore = score
    }
  }
  return best
}

export function loadEventItems(eventId) {
  return all(
    `SELECT i.*, s.kind AS source_kind, s.weight AS source_weight, s.name AS source_name
     FROM items i
     JOIN event_items ei ON ei.item_id = i.id
     JOIN sources s ON s.id = i.source_id
     WHERE ei.event_id = ?
     ORDER BY i.published_at ASC`,
    eventId
  )
}

export function recomputeEvent(eventId) {
  const items = loadEventItems(eventId)
  if (!items.length) return null
  const sourceById = new Map(
    items.map((item) => [
      item.source_id,
      { kind: item.source_kind, weight: item.source_weight, name: item.source_name }
    ])
  )
  const metrics = computeEventMetrics(items, sourceById)
  const verdict = eventVerdict(metrics)
  const title = eventTitle(items)
  const summary = eventSummary(items)
  run(
    `UPDATE events SET
       title = ?, summary = ?, last_updated_at = ?, item_count = ?, source_count = ?,
       independent_domains = ?, source_trust = ?, corroboration = ?, rumor = ?,
       credibility = ?, heat = ?, verdict = ?
     WHERE id = ?`,
    title,
    summary,
    nowIso(),
    items.length,
    metrics.sourceCount,
    metrics.independentDomains,
    metrics.sourceTrust,
    metrics.corroboration,
    metrics.rumor,
    metrics.credibility,
    metrics.heat,
    verdict,
    eventId
  )
  return { items, metrics, verdict, title, summary }
}

export function createEvent(item) {
  const key = eventKey(item.title, item.published_at)
  const existing = get('SELECT * FROM events WHERE event_key = ?', key)
  if (existing) {
    run('INSERT OR IGNORE INTO event_items(event_id, item_id) VALUES(?, ?)', existing.id, item.id)
    return existing.id
  }
  const now = nowIso()
  const result = run(
    `INSERT INTO events(event_key, title, summary, first_seen_at, last_updated_at,
       item_count, source_count, independent_domains, verdict)
     VALUES(?, ?, ?, ?, ?, 1, 1, 1, 'unverified')`,
    key,
    item.title,
    item.excerpt || '',
    item.published_at || now,
    now
  )
  const eventId = Number(result.lastInsertRowid)
  run('INSERT OR IGNORE INTO event_items(event_id, item_id) VALUES(?, ?)', eventId, item.id)
  return eventId
}

export function attachItem(eventId, itemId) {
  const changed = run(
    'INSERT OR IGNORE INTO event_items(event_id, item_id) VALUES(?, ?)',
    eventId,
    itemId
  )
  return changed.changes > 0
}

export function processItems(itemIds) {
  const results = []
  transaction(() => {
    for (const id of itemIds) {
      const item = get('SELECT * FROM items WHERE id = ?', id)
      if (!item) continue
      const similar = findSimilarEvent(item.title)
      const eventId = similar ? similar.id : createEvent(item)
      if (similar) attachItem(eventId, item.id)
      const payload = recomputeEvent(eventId)
      const links = get('SELECT event_id FROM event_items WHERE item_id = ?', item.id)
      results.push({ itemId: id, eventId, payload, firstLink: !links || links.event_id === eventId })
    }
  })
  return results
}
