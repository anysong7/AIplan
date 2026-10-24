import crypto from 'node:crypto'

const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g
const PUNCT = /[，。！？、；：""''（）【】《》「」『』…—·,\.!\?;:"'\(\)\[\]<>]/g

export function normalizeText(input = '') {
  return String(input)
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeTitle(input = '') {
  return normalizeText(input)
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripHtml(input = '') {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(input = '', max = 300) {
  const text = String(input)
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

export function canonicalUrl(raw) {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.hostname === 't.co') return raw
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    const drop = []
    for (const key of url.searchParams.keys()) {
      if (key.startsWith('utm_') || ['fbclid', 'gclid', 'ref', 'ref_src', 'oc'].includes(key)) {
        drop.push(key)
      }
    }
    for (const key of drop) url.searchParams.delete(key)
    let pathname = url.pathname.replace(/\/+$/, '')
    if (!pathname) pathname = '/'
    url.pathname = pathname
    return url.toString()
  } catch {
    return String(raw).trim()
  }
}

export function urlHash(raw) {
  return crypto.createHash('sha1').update(canonicalUrl(raw)).digest('hex')
}

export function domainOf(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex')
}

export function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function hoursAgo(iso) {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, (Date.now() - t) / 3600000)
}

export function toIsoDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}
