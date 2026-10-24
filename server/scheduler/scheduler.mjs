import crypto from 'node:crypto'
import { all, get, nowIso, run, upsertUsage } from '../db/index.mjs'
import { config } from '../config.mjs'
import { collectForSource, GLOBAL_KINDS } from '../collectors/index.mjs'
import { ingestRawItems } from '../core/pipeline.mjs'
import { evaluateAlerts } from '../core/alerts.mjs'
import { buildQuery, parseArray } from '../core/keywords.mjs'
import { publish } from '../notify/hub.mjs'

const jobs = new Map()
let timer = null
let running = false

const now = () => Date.now()
const iso = () => nowIso()

function due(lastAt, intervalSec, cooldownUntil) {
  if (cooldownUntil && new Date(cooldownUntil).getTime() > now()) return false
  if (!lastAt) return true
  return now() - new Date(lastAt).getTime() >= intervalSec * 1000
}

function updateHealth(source, ok, { error, etag, lastModified, cursor } = {}) {
  if (ok) {
    run(
      `UPDATE sources SET last_fetch_at = ?, fail_count = 0, health = 'ok', cooldown_until = NULL,
         etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified),
         cursor = COALESCE(?, cursor)
       WHERE id = ?`,
      iso(),
      etag || null,
      lastModified || null,
      cursor || null,
      source.id
    )
    if (source.health !== 'ok') {
      publish('source.health', { source: source.kind, name: source.name, health: 'ok' })
    }
  } else {
    const failCount = Number(source.fail_count || 0) + 1
    const cooldown =
      error?.status === 429
        ? new Date(now() + 30 * 60 * 1000).toISOString()
        : failCount >= 3
          ? new Date(now() + 15 * 60 * 1000).toISOString()
          : null
    const health = failCount >= 3 ? 'degraded' : source.health || 'ok'
    run(
      `UPDATE sources SET fail_count = ?, health = ?, cooldown_until = ?, last_fetch_at = ?
       WHERE id = ?`,
      failCount,
      health,
      cooldown,
      iso(),
      source.id
    )
    publish('source.health', {
      source: source.kind,
      name: source.name,
      health,
      lastError: error?.message || '请求失败'
    })
  }
}

async function refreshSource(source, job) {
  job.phase = `collect:${source.kind}`
  job.current = source.name
  try {
    const result = await collectForSource(source, {})
    if (result.notModified) {
      updateHealth(source, true)
      return
    }
    const items = result.items || []
    const inserted = ingestRawItems(source, items)
    upsertUsage(source.kind, { calls: 1, units: items.length })
    updateHealth(source, true, {
      etag: result.etag,
      lastModified: result.lastModified,
      cursor: result.cursor
    })
    job.processed += inserted.length
    job.total += items.length
  } catch (error) {
    updateHealth(source, false, { error })
    job.errors.push(`${source.name}: ${error.message}`)
  }
}

async function refreshGlobalSources(job, force = false) {
  const kinds = [...GLOBAL_KINDS]
  const sources = all(
    `SELECT * FROM sources WHERE enabled = 1 AND kind IN (${kinds.map(() => '?').join(',')})`,
    ...kinds
  )
  for (const source of sources) {
    if (!force && !due(source.last_fetch_at, config.scanIntervalSec, source.cooldown_until)) continue
    await refreshSource(source, job)
  }
}

function queryForTarget(target, kind) {
  if (kind === 'watch') {
    const aliases = parseArray(target.aliases).slice(0, 3)
    return buildQuery([target.keyword, ...aliases])
  }
  return buildQuery(parseArray(target.queries).slice(0, 5))
}

function queryForSource(target, kind, sourceKind) {
  if (sourceKind === 'hn') {
    return kind === 'watch' ? target.keyword : parseArray(target.queries)[0] || ''
  }
  return queryForTarget(target, kind)
}

async function scanQuerySources(target, kind, job) {
  const kinds = ['hn', 'bing-news']
  if (config.gdeltEnabled) kinds.push('gdelt')
  if (config.xEnabled && config.twitterApiKey) kinds.push('x')

  const sources = all(
    `SELECT * FROM sources WHERE enabled = 1 AND kind IN (${kinds.map(() => '?').join(',')})`,
    ...kinds
  )

  for (const source of sources) {
    if (source.cooldown_until && new Date(source.cooldown_until).getTime() > now()) continue
    const query = queryForSource(target, kind, source.kind)
    if (!query) continue
    job.phase = `search:${source.kind}`
    job.current = `${kind}:${target.keyword || target.name}`
    try {
      const result = await collectForSource(source, { query })
      const items = result.items || []
      const inserted = ingestRawItems(source, items)
      upsertUsage(source.kind, { calls: 1, units: items.length })
      updateHealth(source, true)
      job.processed += inserted.length
      job.total += items.length
    } catch (error) {
      updateHealth(source, false, { error })
      job.errors.push(`${source.kind}/${source.name}: ${error.message}`)
    }
  }

  if (kind === 'watch') {
    run('UPDATE watches SET last_scan_at = ? WHERE id = ?', iso(), target.id)
  } else {
    run('UPDATE topics SET last_scan_at = ? WHERE id = ?', iso(), target.id)
  }
}

async function scanDueTargets(job, force = false) {
  for (const watch of all('SELECT * FROM watches WHERE enabled = 1')) {
    if (!force && !due(watch.last_scan_at, watch.interval_sec || config.scanIntervalSec)) continue
    await scanQuerySources(watch, 'watch', job)
  }
  for (const topic of all('SELECT * FROM topics WHERE enabled = 1')) {
    if (!force && !due(topic.last_scan_at, topic.interval_sec || config.scanIntervalSec)) continue
    await scanQuerySources(topic, 'topic', job)
  }
}

export function backfillTarget(_kind, _id, hours = 72) {
  const since = new Date(now() - hours * 3600 * 1000).toISOString()
  const events = all(
    'SELECT id FROM events WHERE last_updated_at >= ? ORDER BY last_updated_at DESC LIMIT 200',
    since
  )
  let count = 0
  for (const event of events) {
    try {
      count += evaluateAlerts(event.id).length
    } catch {
      // ignore single event failure
    }
  }
  return count
}

function newJob() {
  return {
    id: crypto.randomUUID(),
    status: 'running',
    phase: 'init',
    current: '',
    processed: 0,
    total: 0,
    errors: [],
    startedAt: iso(),
    finishedAt: null
  }
}

async function executeScan(job, scope = 'all', force = true) {
  try {
    if (scope === 'all') {
      await refreshGlobalSources(job, force)
      await scanDueTargets(job, force)
    } else if (scope.startsWith('watch:')) {
      const target = get('SELECT * FROM watches WHERE id = ?', Number(scope.split(':')[1]))
      if (target) {
        await scanQuerySources(target, 'watch', job)
      }
    } else if (scope.startsWith('topic:')) {
      const target = get('SELECT * FROM topics WHERE id = ?', Number(scope.split(':')[1]))
      if (target) {
        await scanQuerySources(target, 'topic', job)
      }
    }
    job.status = 'done'
  } catch (error) {
    job.status = 'failed'
    job.errors.push(error.message)
  } finally {
    job.finishedAt = iso()
    job.phase = 'done'
    publish('scan.progress', job)
  }
  return job
}

export function startScan(scope = 'all') {
  const job = newJob()
  jobs.set(job.id, job)
  executeScan(job, scope, true)
  return job
}

export async function runScanNow(scope = 'all') {
  const job = newJob()
  jobs.set(job.id, job)
  await executeScan(job, scope, true)
  return job
}

export function getJob(id) {
  return jobs.get(id) || null
}

export async function tick() {
  if (running) return
  running = true
  try {
    const job = newJob()
    jobs.set(job.id, job)
    await executeScan(job, 'all', false)
    for (const [id, item] of jobs) {
      if (now() - new Date(item.startedAt).getTime() > 3600 * 1000) jobs.delete(id)
    }
  } finally {
    running = false
  }
}

export function startScheduler() {
  if (timer) return
  timer = setInterval(() => {
    tick().catch(() => {})
  }, 30000)
  timer.unref?.()
  tick().catch(() => {})
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}

export function schedulerState() {
  return { running, jobs: jobs.size, intervalSec: config.scanIntervalSec }
}

