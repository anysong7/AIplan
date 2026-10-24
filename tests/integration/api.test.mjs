import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let server
let base
let deps

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-test-'))
  process.env.DB_PATH = path.join(dir, 'radar.db')
  process.env.MAIL_TRANSPORT = 'stream'
  process.env.MAIL_TO = 'test@example.com'
  process.env.SCHEDULER_ENABLED = '0'
  process.env.LOG_LEVEL = 'error'

  const { createApp } = await import('../../server/app.mjs')
  const pipeline = await import('../../server/core/pipeline.mjs')
  const db = await import('../../server/db/index.mjs')
  deps = { ...pipeline, ...db, dir }

  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  deps?.closeDb?.()
  if (deps?.dir) fs.rmSync(deps.dir, { recursive: true, force: true })
})

async function json(pathname, options = {}) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json()
  return { res, data }
}

test('status 使用规则核验', async () => {
  const { res, data } = await json('/api/status')
  assert.equal(res.status, 200)
  assert.equal(data.verifyMode, 'rules')
  assert.equal(data.aiEnabled, false)
})

test('关键词监控：官方来源推送，未知单源不推送', async () => {
  const created = await json('/api/watches', {
    method: 'POST',
    body: { keyword: 'OpenAI', aliases: 'gpt' }
  })
  assert.equal(created.res.status, 201)
  const watchId = created.data.watch.id

  const source = deps.get("SELECT * FROM sources WHERE kind = 'rss' LIMIT 1")
  const officialIds = deps.ingestRawItems(source, [
    {
      externalId: 'test:official:1',
      title: 'OpenAI releases GPT-5.2 with better coding',
      url: 'https://openai.com/index/gpt-5-2-test',
      excerpt: 'Official announcement from OpenAI.',
      publishedAt: new Date().toISOString(),
      platform: 'web',
      domain: 'openai.com'
    }
  ])
  assert.equal(officialIds.length, 1)

  const afterOfficial = deps.get('SELECT COUNT(*) AS c FROM alerts')
  assert.ok(afterOfficial.c >= 1)
  const alert = deps.get('SELECT * FROM alerts WHERE watch_id = ? ORDER BY id DESC LIMIT 1', watchId)
  assert.ok(alert)
  assert.equal(alert.verdict, 'verified')

  const bing = deps.get("SELECT * FROM sources WHERE kind = 'bing-news' LIMIT 1")
  const unknownIds = deps.ingestRawItems(bing, [
    {
      externalId: 'test:unknown:1',
      title: 'OpenAI 招聘研究员，传闻薪资上调',
      url: 'https://unknown-blog.example/openai-hiring',
      excerpt: '未经证实的消息。',
      publishedAt: new Date().toISOString(),
      platform: 'web',
      domain: 'unknown-blog.example'
    }
  ])
  assert.equal(unknownIds.length, 1)
  const afterUnknown = deps.get('SELECT COUNT(*) AS c FROM alerts')
  assert.equal(afterUnknown.c, afterOfficial.c)
})

test('热点接口返回证据与可信度', async () => {
  const { res, data } = await json('/api/hotspots?since=24h&limit=10')
  assert.equal(res.status, 200)
  assert.ok(data.items.length >= 1)
  const official = data.items.find((e) => e.title.includes('GPT-5.2'))
  assert.ok(official)
  assert.equal(official.verdict, 'verified')
  assert.ok(official.credibility >= 0.65)
  assert.ok(Array.isArray(official.sources))
})

test('测试邮件走 stream 传输并生成预览', async () => {
  const { res, data } = await json('/api/test/email', { method: 'POST', body: {} })
  assert.equal(res.status, 200)
  assert.equal(data.ok, true)
  assert.equal(data.mode, 'stream')
  assert.match(data.previewUrl, /\/api\/mail-preview\/mail-\d+\.html$/)

  const preview = await fetch(`${base}${new URL(data.previewUrl).pathname}`)
  assert.equal(preview.status, 200)
  const raw = await preview.text()
  assert.match(raw, /SIGNAL/)
  assert.match(raw, /测试邮件/)
})

test('SSE 返回 hello 事件', async () => {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/stream`, { signal: controller.signal })
  assert.ok(res.headers.get('content-type').startsWith('text/event-stream'))
  const reader = res.body.getReader()
  const { value } = await reader.read()
  const text = new TextDecoder().decode(value)
  assert.ok(text.includes('event: hello'))
  controller.abort()
})
