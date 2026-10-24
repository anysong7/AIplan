import { fetchText } from './http.mjs'
import { parseFeed } from './xml.mjs'
import { urlHash } from '../core/normalize.mjs'

export function decodeBingLink(link = '') {
  try {
    const url = new URL(link)
    if (/apiclick\.aspx$/i.test(url.pathname) || url.hostname.includes('bing.com')) {
      const original = url.searchParams.get('url')
      if (original) return original
    }
    return link
  } catch {
    return link
  }
}

export async function collectBing(source, query) {
  if (!query) return []
  const url = new URL(source.url)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'rss')
  url.searchParams.set('setlang', 'zh-cn')
  url.searchParams.set('cc', 'cn')

  const res = await fetchText(url.toString(), { minGapMs: 1500 })
  const feed = parseFeed(res.text)
  return feed.map((item) => {
    const original = decodeBingLink(item.url)
    return {
      ...item,
      externalId: `bing:${urlHash(original)}`,
      url: original,
      platform: 'web',
      metrics: {}
    }
  })
}
