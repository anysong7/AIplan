import { XMLParser } from 'fast-xml-parser'
import { stripHtml, truncate } from '../core/normalize.mjs'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseTagValue: false,
  trimValues: true
})

const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

export function textOf(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    if (value['#text'] != null) return String(value['#text'])
    if (value['#cdata'] != null) return String(value['#cdata'])
  }
  return ''
}

export function linkOf(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const preferred = value.find((v) => !v['@_rel'] || v['@_rel'] === 'alternate') || value[0]
    return linkOf(preferred)
  }
  if (typeof value === 'object') {
    return value['@_href'] || value['@_url'] || textOf(value)
  }
  return ''
}

export function parseFeed(xml) {
  const doc = parser.parse(xml)
  if (doc.rss?.channel) {
    const channel = doc.rss.channel
    return asArray(channel.item).map((item) => {
      const url = linkOf(item.link) || textOf(item.guid)
      const summary = textOf(item.description) || textOf(item['content:encoded'])
      return {
        externalId: textOf(item.guid) || url,
        title: stripHtml(textOf(item.title)),
        url,
        excerpt: truncate(stripHtml(summary), 300),
        publishedAt: textOf(item.pubDate) || textOf(item['dc:date']),
        author: textOf(item.author) || textOf(item['dc:creator']),
        lang: textOf(item.language),
        raw: null
      }
    })
  }

  if (doc.feed?.entry) {
    return asArray(doc.feed.entry).map((entry) => {
      const url = linkOf(entry.link) || textOf(entry.id)
      return {
        externalId: textOf(entry.id) || url,
        title: stripHtml(textOf(entry.title)),
        url,
        excerpt: truncate(stripHtml(textOf(entry.summary) || textOf(entry.content)), 300),
        publishedAt: textOf(entry.published) || textOf(entry.updated),
        author: textOf(entry.author?.name) || '',
        lang: '',
        raw: null
      }
    })
  }

  return []
}

export function parseSitemap(xml) {
  const doc = parser.parse(xml)
  const root = doc.urlset || doc.sitemapindex
  if (!root) return { type: 'unknown', urls: [], sitemaps: [] }
  if (doc.sitemapindex) {
    const sitemaps = asArray(root.sitemap)
      .map((entry) => ({ loc: textOf(entry.loc), lastmod: textOf(entry.lastmod) }))
      .filter((entry) => entry.loc)
    return { type: 'index', urls: [], sitemaps }
  }
  const urls = asArray(root.url)
    .map((entry) => ({ loc: textOf(entry.loc), lastmod: textOf(entry.lastmod) }))
    .filter((entry) => entry.loc)
  return { type: 'urlset', urls, sitemaps: [] }
}
