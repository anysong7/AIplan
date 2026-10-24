import {
  isImpersonationHandle,
  isOfficialHandle,
  isTyposquat,
  itemTrust,
  registrableDomain,
  rumorSignal
} from './trust.mjs'
import { hoursAgo, truncate } from './normalize.mjs'

const SOCIAL_DOMAINS = new Set(['x.com', 'twitter.com', 't.co'])

export function metricScore(raw) {
  if (!raw) return 0
  let metrics = raw
  if (typeof raw === 'string') {
    try {
      metrics = JSON.parse(raw)
    } catch {
      return 0
    }
  }
  const points = Number(metrics.points || 0)
  const likes = Number(metrics.likes || 0)
  const retweets = Number(metrics.retweets || 0)
  const replies = Number(metrics.replies || metrics.comments || 0)
  const views = Number(metrics.views || 0)
  const raw0 = points + likes + retweets * 2 + replies + views / 100
  if (!raw0) return 0
  return Math.min(1, Math.log10(1 + raw0) / 4)
}

export function computeEventMetrics(items, sourceById = new Map()) {
  const domains = new Set()
  let maxTrust = 0
  let firstParty = false
  let impersonation = false
  let typosquat = false
  let rumor = 0
  let engagement = 0
  let latest = null
  const sourceIds = new Set()

  for (const item of items) {
    const source = sourceById.get(item.source_id) || {}
    const trust = itemTrust(item, source)
    if (trust > maxTrust) maxTrust = trust
    if (item.is_first_party) firstParty = true
    if (item.impersonation || isImpersonationHandle(item.author_handle)) impersonation = true
    if (item.typosquat || isTyposquat(item.domain)) typosquat = true

    const domain = registrableDomain(item.domain || '')
    if (domain && !SOCIAL_DOMAINS.has(domain)) domains.add(domain)

    rumor = Math.max(rumor, rumorSignal(`${item.title} ${item.excerpt || ''}`))
    engagement = Math.max(engagement, metricScore(item.metrics_json))
    if (!latest || String(item.published_at || '') > latest) {
      latest = item.published_at || latest
    }
    sourceIds.add(item.source_id)
  }

  const independentDomains = domains.size
  const corroboration = Math.min(1, independentDomains / 3)
  const credibility = Number(
    (0.45 * maxTrust + 0.35 * corroboration + 0.2 * (1 - rumor)).toFixed(4)
  )
  const recency = latest ? Math.exp(-hoursAgo(latest) / 12) : 0
  const heat = Number(
    (0.4 * maxTrust + 0.25 * recency + 0.2 * engagement + 0.15 * corroboration).toFixed(4)
  )

  return {
    sourceTrust: Number(maxTrust.toFixed(4)),
    corroboration: Number(corroboration.toFixed(4)),
    rumor: Number(rumor.toFixed(2)),
    independentDomains,
    sourceCount: sourceIds.size,
    firstParty,
    impersonation,
    typosquat,
    credibility,
    heat,
    latestPublishedAt: latest
  }
}

export function eventVerdict(metrics) {
  if (metrics.impersonation) return 'suspicious'
  if (metrics.credibility >= 0.65 && metrics.firstParty) return 'verified'
  if (metrics.credibility >= 0.75 && metrics.independentDomains >= 2) return 'likely'
  if (metrics.credibility >= 0.5) return 'unverified'
  return 'suspicious'
}

export function canPush(metrics, minCredibility = 0.65, minDomains = 2) {
  return (
    !metrics.impersonation &&
    metrics.rumor < 0.5 &&
    metrics.credibility >= minCredibility &&
    (metrics.firstParty || metrics.independentDomains >= minDomains)
  )
}

export function eventSummary(items) {
  const primary = items.find((item) => item.excerpt) || items[0]
  return primary ? truncate(primary.excerpt || primary.title, 220) : ''
}

export function eventTitle(items) {
  const primary = items.find((item) => item.is_first_party) || items[0]
  return primary ? primary.title : '未命名事件'
}

export { isOfficialHandle, isImpersonationHandle }
