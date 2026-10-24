import { collectHn } from './hn.mjs'
import { collectBing } from './bing.mjs'
import { collectRss } from './rss.mjs'
import { collectGithub } from './github.mjs'
import { collectArxiv } from './arxiv.mjs'
import { collectSitemap } from './sitemap.mjs'
import { collectGdelt } from './gdelt.mjs'
import { collectX } from './x.mjs'

export const GLOBAL_KINDS = new Set(['rss', 'github', 'arxiv', 'sitemap'])
export const QUERY_KINDS = new Set(['hn', 'bing-news', 'gdelt', 'x'])

export async function collectForSource(source, { query } = {}) {
  switch (source.kind) {
    case 'hn':
      return { items: await collectHn(source, query) }
    case 'bing-news':
      return { items: await collectBing(source, query) }
    case 'rss':
      return collectRss(source)
    case 'github':
      return { items: await collectGithub(source) }
    case 'arxiv':
      return { items: await collectArxiv(source) }
    case 'sitemap':
      return collectSitemap(source)
    case 'gdelt':
      return { items: await collectGdelt(source, query) }
    case 'x':
      return { items: await collectX(source, query) }
    default:
      return { items: [] }
  }
}
