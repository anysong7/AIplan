import { normalizeText } from './normalize.mjs'

export function parseArray(value, fallback = []) {
  if (Array.isArray(value)) return value
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function termMatches(text, term) {
  const haystack = normalizeText(text)
  const needle = normalizeText(term)
  if (!needle) return false
  if (/[a-z0-9]/i.test(needle)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, 'i')
    return re.test(haystack)
  }
  return haystack.includes(needle)
}

export function matchWatch(text, watch) {
  const aliases = parseArray(watch.aliases)
  const excludes = parseArray(watch.exclude_terms ?? watch.excludeTerms)
  if (excludes.some((term) => termMatches(text, term))) {
    return { matched: false, term: null }
  }
  const terms = [watch.keyword, ...aliases].filter(Boolean)
  for (const term of terms) {
    if (termMatches(text, term)) return { matched: true, term }
  }
  return { matched: false, term: null }
}

export function matchTopic(text, topic) {
  const queries = parseArray(topic.queries)
  for (const term of queries) {
    if (termMatches(text, term)) return { matched: true, term }
  }
  return { matched: false, term: null }
}

export function buildQuery(terms) {
  const cleaned = terms
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((t) => (/\s/.test(t) ? `"${t.replace(/"/g, '')}"` : t))
  return cleaned.join(' OR ')
}
