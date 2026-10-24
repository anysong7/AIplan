import { fetchText } from './http.mjs'
import { parseFeed } from './xml.mjs'

export async function collectRss(source) {
  const res = await fetchText(source.url, {
    etag: source.etag,
    lastModified: source.last_modified,
    minGapMs: 1000
  })
  if (res.notModified) {
    return { items: [], etag: source.etag, lastModified: source.last_modified, notModified: true }
  }
  const items = parseFeed(res.text).slice(0, 40).map((item) => ({
    ...item,
    platform: 'web',
    metrics: {}
  }))
  return {
    items,
    etag: res.etag,
    lastModified: res.lastModified,
    notModified: false
  }
}
