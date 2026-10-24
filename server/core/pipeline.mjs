import { all, get, nowIso, run, transaction } from '../db/index.mjs'
import { canonicalUrl, domainOf, parseDate, stripHtml, truncate, urlHash } from './normalize.mjs'
import { isImpersonationHandle, isTyposquat, isOfficialDomain } from './trust.mjs'
import { processItems } from './cluster.mjs'
import { evaluateAlerts } from './alerts.mjs'

export function normalizeRawItem(raw, source) {
  const url = raw.url || ''
  const canonical = canonicalUrl(url)
  const domain = raw.domain || domainOf(canonical)
  const title = truncate(stripHtml(raw.title || ''), 300)
  if (!title || !canonical) return null
  const publishedAt = parseDate(raw.publishedAt)
  const authorHandle = raw.authorHandle || ''
  const rawExcerpt = truncate(stripHtml(raw.excerpt || ''), 300)
  const excerpt = rawExcerpt && rawExcerpt !== title ? rawExcerpt : ''
  return {
    source_id: source.id,
    platform: raw.platform || (source.kind === 'x' ? 'x' : 'web'),
    external_id: String(raw.externalId || urlHash(canonical)),
    url_hash: urlHash(canonical),
    canonical_url: canonical,
    domain,
    title,
    excerpt,
    author: raw.author || '',
    author_handle: authorHandle,
    author_followers: raw.authorFollowers ?? null,
    author_verified: raw.authorVerified ? 1 : 0,
    author_created_at: parseDate(raw.authorCreatedAt),
    published_at: publishedAt,
    fetched_at: nowIso(),
    lang: raw.lang || '',
    is_first_party: raw.isFirstParty || isOfficialDomain(domain) ? 1 : 0,
    impersonation: raw.impersonation || isImpersonationHandle(authorHandle) ? 1 : 0,
    typosquat: isTyposquat(domain) ? 1 : 0,
    metrics_json: raw.metrics ? JSON.stringify(raw.metrics) : null,
    raw_json: raw.raw ? JSON.stringify(raw.raw) : null
  }
}

export function ingestRawItems(source, rawItems) {
  const ids = []
  transaction(() => {
    for (const raw of rawItems) {
      const item = normalizeRawItem(raw, source)
      if (!item) continue
      const inserted = run(
        `INSERT OR IGNORE INTO items(
           source_id, platform, external_id, url_hash, canonical_url, domain, title, excerpt,
           author, author_handle, author_followers, author_verified, author_created_at,
           published_at, fetched_at, lang, is_first_party, impersonation, typosquat,
           metrics_json, raw_json
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.source_id,
        item.platform,
        item.external_id,
        item.url_hash,
        item.canonical_url,
        item.domain,
        item.title,
        item.excerpt,
        item.author,
        item.author_handle,
        item.author_followers,
        item.author_verified,
        item.author_created_at,
        item.published_at,
        item.fetched_at,
        item.lang,
        item.is_first_party,
        item.impersonation,
        item.typosquat,
        item.metrics_json,
        item.raw_json
      )
      if (inserted.changes > 0) {
        ids.push(Number(inserted.lastInsertRowid))
      }
    }
  })

  if (ids.length) {
    const results = processItems(ids)
    for (const result of results) {
      evaluateAlerts(result.eventId, { itemId: result.itemId })
    }
  }
  return ids
}

export function eventDetails(eventId) {
  const event = get('SELECT * FROM events WHERE id = ?', eventId)
  if (!event) return null
  const items = all(
    `SELECT i.*, s.name AS source_name, s.kind AS source_kind
     FROM items i
     JOIN event_items ei ON ei.item_id = i.id
     JOIN sources s ON s.id = i.source_id
     WHERE ei.event_id = ?
     ORDER BY i.published_at ASC`,
    eventId
  )
  const alerts = all('SELECT * FROM alerts WHERE event_id = ? ORDER BY id DESC', eventId)
  return { event, items, alerts }
}
