import { fetchJson } from './http.mjs'
import { domainOf } from '../core/normalize.mjs'

function gdeltDate(value) {
  if (!value || value.length < 15) return null
  const s = value.replace('T', '').replace('Z', '')
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(
    11,
    13
  )}:${s.slice(13, 15)}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function collectGdelt(source, query) {
  if (!query) return []
  const url = new URL(source.url)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'ArtList')
  url.searchParams.set('format', 'json')
  url.searchParams.set('timespan', '1d')
  url.searchParams.set('maxrecords', '50')
  url.searchParams.set('sort', 'DateDesc')

  const { data } = await fetchJson(url.toString(), { minGapMs: 5000 })
  const articles = Array.isArray(data?.articles) ? data.articles : []
  return articles
    .filter((a) => a.title && a.url)
    .map((a) => ({
      externalId: `gdelt:${a.url}`,
      title: a.title,
      url: a.url,
      excerpt: '',
      publishedAt: gdeltDate(a.seendate),
      platform: 'web',
      domain: a.domain || domainOf(a.url),
      lang: a.language || '',
      metrics: {}
    }))
}
