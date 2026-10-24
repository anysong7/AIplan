import { config } from '../config.mjs'

export const USER_AGENT = `SIGNAL-Radar/0.1 (+local personal monitoring; contact=${config.mailTo})`

const lastAt = new Map()
const chains = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitHost(host, minGapMs) {
  const previous = chains.get(host) || Promise.resolve()
  const next = previous.then(async () => {
    const last = lastAt.get(host) || 0
    const wait = minGapMs - (Date.now() - last)
    if (wait > 0) await sleep(wait)
    lastAt.set(host, Date.now())
  })
  chains.set(
    host,
    next.catch(() => {})
  )
  return next
}

export async function fetchText(url, options = {}) {
  const {
    headers = {},
    timeoutMs = config.requestTimeoutMs,
    minGapMs = 1000,
    retries = 2,
    etag,
    lastModified
  } = options

  const host = new URL(url).host
  await waitHost(host, minGapMs)

  const requestHeaders = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...headers
  }
  if (etag) requestHeaders['If-None-Match'] = etag
  if (lastModified) requestHeaders['If-Modified-Since'] = lastModified

  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: requestHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (res.status === 304) {
        return { status: 304, notModified: true, headers: res.headers, text: '' }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const error = new Error(`HTTP ${res.status} ${url}`)
        error.status = res.status
        error.body = body.slice(0, 500)
        error.retryAfter = res.headers.get('retry-after')
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const wait = Number(error.retryAfter) * 1000 || (attempt + 1) * 1500
          await sleep(wait)
          continue
        }
        throw error
      }
      const text = await res.text()
      return {
        status: res.status,
        notModified: false,
        text,
        headers: res.headers,
        etag: res.headers.get('etag') || null,
        lastModified: res.headers.get('last-modified') || null
      }
    } catch (err) {
      lastError = err
      if (attempt < retries && !err.status) {
        await sleep((attempt + 1) * 1000)
        continue
      }
      throw err
    }
  }
  throw lastError || new Error(`请求失败 ${url}`)
}

export async function fetchJson(url, options = {}) {
  const res = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  })
  if (res.notModified) return { ...res, data: null }
  return { ...res, data: JSON.parse(res.text) }
}
