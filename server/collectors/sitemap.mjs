import robotsParser from 'robots-parser'
import * as cheerio from 'cheerio'
import { config } from '../config.mjs'
import { get, nowIso, run } from '../db/index.mjs'
import { fetchText, USER_AGENT } from './http.mjs'
import { parseSitemap } from './xml.mjs'
import { domainOf, parseDate, urlHash } from '../core/normalize.mjs'

async function robotsFor(site) {
  const url = new URL(site)
  const host = url.host
  const cached = get('SELECT * FROM robots_cache WHERE host = ?', host)
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000) {
    return JSON.parse(cached.rules_json)
  }
  let text = ''
  let sitemaps = []
  try {
    const res = await fetchText(`${url.origin}/robots.txt`, { minGapMs: 1000 })
    text = res.text
    sitemaps = [...text.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1])
  } catch {
    // robots.txt 缺失时按允许处理
  }
  const json = JSON.stringify({ text, sitemaps })
  run(
    `INSERT INTO robots_cache(host, rules_json, fetched_at) VALUES(?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET rules_json = excluded.rules_json, fetched_at = excluded.fetched_at`,
    host,
    json,
    nowIso()
  )
  return { text, sitemaps }
}

function isAllowed(site, robots, url) {
  try {
    const parser = robotsParser(`${new URL(site).origin}/robots.txt`, robots.text || '')
    return parser.isAllowed(url, USER_AGENT) !== false
  } catch {
    return true
  }
}

async function loadSitemapUrls(site, robots) {
  const origin = new URL(site).origin
  const candidates = robots.sitemaps.length ? robots.sitemaps.slice(0, 3) : [`${origin}/sitemap.xml`]
  const urls = []
  for (const candidate of candidates) {
    try {
      const res = await fetchText(candidate, { minGapMs: 1500, timeoutMs: 20000 })
      const parsed = parseSitemap(res.text)
      if (parsed.type === 'index') {
        for (const child of parsed.sitemaps.slice(0, 3)) {
          try {
            const sub = await fetchText(child.loc, { minGapMs: 1500, timeoutMs: 20000 })
            urls.push(...parseSitemap(sub.text).urls)
          } catch {
            // 子 sitemap 失败忽略
          }
        }
      } else {
        urls.push(...parsed.urls)
      }
    } catch {
      // 单个 sitemap 失败忽略
    }
  }
  return urls
}

function extractArticle(html, fallbackUrl) {
  const $ = cheerio.load(html)
  const meta = (name) =>
    $(`meta[property="${name}"]`).attr('content') ||
    $(`meta[name="${name}"]`).attr('content') ||
    ''
  const title = meta('og:title') || $('title').first().text() || ''
  const description = meta('og:description') || meta('description') || ''
  const canonical = $('link[rel="canonical"]').attr('href') || fallbackUrl
  let published = meta('article:published_time') || meta('datePublished') || ''

  if (!published) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (published) return
      try {
        const data = JSON.parse($(el).contents().text())
        const candidates = Array.isArray(data) ? data : [data]
        for (const node of candidates) {
          if (node && node.datePublished) {
            published = node.datePublished
            break
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    })
  }

  return {
    title: String(title).trim(),
    description: String(description).trim(),
    canonical,
    publishedAt: parseDate(published)
  }
}

export async function collectSitemap(source) {
  const site = source.url
  const robots = await robotsFor(site)
  let urls = await loadSitemapUrls(site, robots)

  const cursor = source.cursor || ''
  urls = urls
    .filter((entry) => entry.loc)
    .filter((entry) => !cursor || !entry.lastmod || entry.lastmod > cursor)
    .sort((a, b) => String(b.lastmod || '').localeCompare(String(a.lastmod || '')))
    .slice(0, config.crawlMaxPages)

  const items = []
  let newest = cursor
  for (const entry of urls) {
    if (!isAllowed(site, robots, entry.loc)) continue
    try {
      const res = await fetchText(entry.loc, {
        minGapMs: config.crawlDelayMs,
        timeoutMs: 20000
      })
      const article = extractArticle(res.text, entry.loc)
      if (!article.title) continue
      const finalUrl = article.canonical || entry.loc
      items.push({
        externalId: `sitemap:${urlHash(finalUrl)}`,
        title: article.title,
        url: finalUrl,
        excerpt: article.description,
        publishedAt: article.publishedAt || parseDate(entry.lastmod),
        platform: 'web',
        domain: domainOf(finalUrl),
        metrics: {}
      })
      if (entry.lastmod && entry.lastmod > newest) newest = entry.lastmod
    } catch {
      // 单篇失败不影响整站
    }
  }

  return { items, cursor: newest, notModified: false }
}
