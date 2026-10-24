import { fetchJson } from './http.mjs'
import { domainOf } from '../core/normalize.mjs'

export async function collectHn(source, query) {
  if (!query) return []
  const url = new URL(source.url)
  url.searchParams.set('query', query)
  url.searchParams.set('tags', 'story')
  url.searchParams.set('hitsPerPage', '50')
  const since = Math.floor(Date.now() / 1000) - 72 * 3600
  url.searchParams.set('numericFilters', `created_at_i>${since}`)

  const { data } = await fetchJson(url.toString(), { minGapMs: 1000 })
  const hits = Array.isArray(data?.hits) ? data.hits : []
  return hits
    .filter((hit) => hit.title)
    .map((hit) => {
      const target = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`
      return {
        externalId: `hn:${hit.objectID}`,
        title: hit.title,
        url: target,
        excerpt: hit.story_text || hit.comment_text || '',
        publishedAt: hit.created_at,
        author: hit.author,
        platform: 'web',
        domain: domainOf(target) || 'news.ycombinator.com',
        isFirstParty: false,
        metrics: { points: hit.points, comments: hit.num_comments },
        raw: { objectID: hit.objectID }
      }
    })
}
