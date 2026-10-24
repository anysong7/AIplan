import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from '../config.mjs'

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db = new DatabaseSync(config.dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

const schemaFile = new URL('./schema.sql', import.meta.url)
db.exec(fs.readFileSync(schemaFile, 'utf8'))

export const nowIso = () => new Date().toISOString()

export function run(sql, ...params) {
  return db.prepare(sql).run(...params)
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params)
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params)
}

let txDepth = 0
export function transaction(fn) {
  if (txDepth > 0) return fn()
  txDepth += 1
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore rollback failure
    }
    throw err
  } finally {
    txDepth -= 1
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setSetting(key, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  run(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    raw
  )
}

export function upsertUsage(source, { calls = 0, units = 0, costUsd = 0 } = {}) {
  const day = nowIso().slice(0, 10)
  run(
    `INSERT INTO source_usage(source, day, calls, units, cost_usd) VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(source, day) DO UPDATE SET
       calls = calls + excluded.calls,
       units = units + excluded.units,
       cost_usd = cost_usd + excluded.cost_usd`,
    source,
    day,
    calls,
    units,
    costUsd
  )
}

export function todayUsage(source) {
  const day = nowIso().slice(0, 10)
  const row = get('SELECT * FROM source_usage WHERE source = ? AND day = ?', source, day)
  return row || { calls: 0, units: 0, cost_usd: 0 }
}

export function seed() {
  const createdAt = nowIso()

  const addSource = (kind, name, url, weight, enabled = 1) => {
    run(
      `INSERT OR IGNORE INTO sources(kind, name, url, weight, enabled, created_at)
       VALUES(?, ?, ?, ?, ?, ?)`,
      kind,
      name,
      url,
      weight,
      enabled,
      createdAt
    )
  }

  addSource('hn', 'Hacker News', 'https://hn.algolia.com/api/v1/search_by_date', 0.65)
  addSource('bing-news', 'Bing News RSS', 'https://www.bing.com/news/search', 0.45)
  addSource('github', 'GitHub Releases', 'https://api.github.com', 0.9)
  addSource('arxiv', 'arXiv cs.AI / cs.CL / cs.LG', 'https://export.arxiv.org/api/query', 0.85)
  addSource('gdelt', 'GDELT DOC 2.0', 'https://api.gdeltproject.org/api/v2/doc/doc', 0.6, 0)
  addSource('x', 'X / Twitter (twitterapi.io)', 'https://api.twitterapi.io/twitter/tweet/advanced_search', 0.35, 0)

  for (const entry of config.rssFeeds) {
    const [name, url, type] = entry.split('|')
    if (!url) continue
    addSource('rss', name || url, url, type === 'official' ? 1 : 0.72)
  }
  for (const site of config.crawlSites) {
    addSource('sitemap', site.replace(/^https?:\/\//, '').replace(/\/$/, ''), site, 0.72)
  }

  const topics = [
    {
      name: 'AI 编程',
      queries: ['AI 编程', 'AI coding', 'Copilot', 'Cursor', 'Claude Code', 'Codex', 'AI IDE'],
      kinds: ['hn', 'rss', 'bing-news', 'github', 'sitemap']
    },
    {
      name: '大模型发布',
      queries: ['大模型', 'LLM', 'GPT', 'Claude', 'Gemini', 'Llama', 'Qwen', 'DeepSeek'],
      kinds: ['hn', 'rss', 'bing-news', 'sitemap']
    },
    {
      name: '开源模型',
      queries: ['开源模型', 'open source model', 'Hugging Face', 'Llama', 'Mistral', 'Qwen'],
      kinds: ['hn', 'rss', 'github', 'arxiv']
    }
  ]

  for (const topic of topics) {
    run(
      `INSERT OR IGNORE INTO topics(name, queries, source_kinds, interval_sec, min_credibility, enabled)
       VALUES(?, ?, ?, ?, ?, 1)`,
      topic.name,
      JSON.stringify(topic.queries),
      JSON.stringify(topic.kinds),
      config.scanIntervalSec,
      config.pushMinCredibility
    )
  }

  run(
    `INSERT OR IGNORE INTO settings(key, value) VALUES('schema_version', '1')`
  )
}

seed()

export function closeDb() {
  try {
    db.close()
  } catch {
    // ignore
  }
}
