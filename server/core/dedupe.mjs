import { normalizeTitle, sha1, toIsoDay } from './normalize.mjs'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'that', 'this', 'will',
  'new', 'of', 'to', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'as',
  'its', 'it', 'be', 'has', 'have', 'how', 'why', 'what', 'after', 'before',
  'says', 'said', 'update', 'updates'
])

export function trigrams(input) {
  const text = normalizeTitle(input).replace(/\s+/g, '')
  if (!text) return new Set()
  if (text.length <= 3) return new Set([text])
  const set = new Set()
  for (let i = 0; i <= text.length - 3; i += 1) set.add(text.slice(i, i + 3))
  return set
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let intersection = 0
  for (const value of a) {
    if (b.has(value)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function titleSimilarity(a, b) {
  return jaccard(trigrams(a), trigrams(b))
}

export function isSameEventTitle(a, b, threshold = 0.82) {
  return titleSimilarity(a, b) >= threshold
}

export function titleTokens(title) {
  const text = normalizeTitle(title)
  const tokens = new Set()

  for (const match of text.matchAll(/\b[a-z][a-z0-9.+-]{2,}\b/g)) {
    const word = match[0].replace(/[.+-]+$/, '')
    if (!STOPWORDS.has(word)) tokens.add(word)
  }

  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const run = match[0]
    if (run.length <= 4) tokens.add(run)
    for (let i = 0; i < run.length - 1; i += 1) tokens.add(run.slice(i, i + 2))
  }

  for (const match of text.matchAll(/\b(gpt|claude|gemini|llama|qwen|deepseek|sora|grok)[-\s]?(\d+(?:\.\d+)?)/g)) {
    tokens.add(`${match[1]}-${match[2]}`)
  }

  return [...tokens].sort()
}

export function eventKey(title, dateIso) {
  const day = toIsoDay(dateIso ? new Date(dateIso) : new Date())
  const tokens = titleTokens(title)
  const base = tokens.length ? tokens.join(' ') : normalizeTitle(title)
  return sha1(`${base}|${day}`)
}
