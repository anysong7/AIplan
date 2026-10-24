#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const json = args.includes('--json')
const apiBase = (process.env.RADAR_API || 'http://127.0.0.1:8787').replace(/\/$/, '')
const root =
  process.env.RADAR_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const serverCli = path.join(root, 'server/cli/radar.mjs')

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = args[index + 1]
  return value && !value.startsWith('--') ? value : true
}

function print(data) {
  if (json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
    return
  }
  if (typeof data === 'string') {
    process.stdout.write(`${data}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

async function isOnline() {
  try {
    const res = await fetch(`${apiBase}/api/status`, { signal: AbortSignal.timeout(1200) })
    return res.ok
  } catch {
    return false
  }
}

async function call(pathname, options = {}) {
  const res = await fetch(`${apiBase}/api${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(120000)
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const error = new Error(data?.error?.message || `HTTP ${res.status}`)
    error.code = data?.error?.code || 'HTTP_ERROR'
    throw error
  }
  return data
}

function runStandalone(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverCli, ...extraArgs], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`standalone CLI exited with ${code}`))
    })
  })
}

function scopeFromArgs() {
  if (option('watch')) return `watch:${option('watch')}`
  if (option('topic')) return `topic:${option('topic')}`
  return 'all'
}

function verdictLabel(value) {
  return (
    {
      verified: '已核实',
      likely: '较可信',
      unverified: '未证实',
      suspicious: '疑似'
    }[value] || value
  )
}

function formatHotspots(data) {
  const rows = data.data || data.items || []
  const head = `SIGNAL · ${rows.length} 条 · verify=${data.verifyMode || 'rules'}`
  const lines = rows.map((row, index) => {
    const score = Math.round((row.credibility || 0) * 100)
    const domains = (row.sources || []).map((s) => s.domain).slice(0, 3).join(' · ')
    return `${index + 1}. [${verdictLabel(row.verdict)} ${score}] ${row.title}\n   ${
      domains || `${row.independent_domains || 1} 个独立源`
    }`
  })
  print([head, ...lines].join('\n'))
}

function formatBrief(rows) {
  const md = [
    `# SIGNAL 简报 · ${new Date().toISOString().slice(0, 10)}`,
    '',
    ...rows.map(
      (row, index) =>
        `${index + 1}. **${row.title}**\n   - 可信度 ${Math.round(
          (row.credibility || 0) * 100
        )} · ${row.independent_domains || 1} 个独立源\n   - ${row.summary || ''}\n   - ${
          row.sources?.[0]?.url || ''
        }`
    )
  ].join('\n')
  print(md)
}

async function main() {
  const online = await isOnline()

  if (command === 'help' || command === '--help' || command === '-h') {
    print(`SIGNAL Radar Skill CLI
用法:
  radar.mjs status
  radar.mjs sources [--json]
  radar.mjs hotspots [--since 24h] [--min-credibility 0.65] [--limit 20] [--json]
  radar.mjs watch list [--json]
  radar.mjs watch add "<keyword>" [--aliases a,b] [--exclude x,y] [--json]
  radar.mjs watch remove <id|keyword>
  radar.mjs scan [--all] [--watch <id>] [--topic <id>] [--json]
  radar.mjs brief [--md] [--json]
  radar.mjs notify test [--json]
环境变量:
  RADAR_API  默认 http://127.0.0.1:8787
  RADAR_ROOT 仅 standalone 模式需要，指向项目根目录
说明: 服务在线时走 HTTP；离线时自动调用 server/cli/radar.mjs。`)
    return
  }

  if (!online) {
    const passthrough = args.filter((a) => a !== '--standalone')
    return runStandalone(passthrough)
  }

  if (command === 'status') {
    const status = await call('/status')
    if (json) return print({ ...status, transport: 'http' })
    const counts = status.counts || {}
    print(
      [
        `SIGNAL ${status.version} · ${status.verifyMode} · ${Math.round(
          status.scanIntervalSec / 60
        )}min`,
        `events=${counts.events || 0} unread=${counts.unread || 0} watches=${counts.watches || 0}`,
        `mail=${status.mail?.transport} → ${status.mail?.to}`,
        `sources: ${Object.entries(status.health || {})
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}`
      ].join('\n')
    )
    return
  }

  if (command === 'sources') {
    const data = await call('/sources')
    return print({ ok: true, ...data, transport: 'http' })
  }

  if (command === 'hotspots') {
    const query = new URLSearchParams({
      since: String(option('since', '24h')),
      minCredibility: String(option('min-credibility', '0.65')),
      limit: String(option('limit', '20'))
    })
    const data = await call(`/hotspots?${query.toString()}`)
    if (json) {
      return print({ ok: true, verifyMode: 'rules', count: data.items.length, data: data.items })
    }
    return formatHotspots({ ...data, verifyMode: 'rules' })
  }

  if (command === 'watch') {
    const sub = args[1]
    if (sub === 'list' || !sub) return print(await call('/watches'))
    if (sub === 'add') {
      const keyword = args[2]
      if (!keyword) throw new Error('用法: radar.mjs watch add "<keyword>"')
      const aliases = String(option('aliases', ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const excludeTerms = String(option('exclude', ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const data = await call('/watches', {
        method: 'POST',
        body: {
          keyword,
          aliases,
          excludeTerms,
          minCredibility: Number(option('min-credibility', 0.65))
        }
      })
      return print({ ok: true, watch: data.watch, transport: 'http' })
    }
    if (sub === 'remove') {
      const target = args[2]
      if (!target) throw new Error('用法: radar.mjs watch remove <id|keyword>')
      const list = await call('/watches')
      const watch = (list.items || []).find(
        (item) => String(item.id) === String(target) || item.keyword === target
      )
      if (!watch) return print({ ok: true, removed: null })
      await call(`/watches/${watch.id}`, { method: 'DELETE' })
      return print({ ok: true, removed: watch })
    }
    throw new Error(`未知的 watch 子命令: ${sub}`)
  }

  if (command === 'scan') {
    const data = await call('/scan', {
      method: 'POST',
      body: { scope: scopeFromArgs(), wait: true }
    })
    const job = data.job || {}
    return print({
      ok: job.status === 'done',
      transport: 'http',
      job: {
        id: job.id,
        status: job.status,
        processed: job.processed,
        total: job.total,
        errors: job.errors || []
      }
    })
  }

  if (command === 'brief') {
    const data = await call('/hotspots?since=24h&minCredibility=0.65&limit=10')
    if (option('md')) return formatBrief(data.items || [])
    return print({ ok: true, verifyMode: 'rules', count: data.items.length, data: data.items })
  }

  if (command === 'notify' && args[1] === 'test') {
    const data = await call('/test/email', { method: 'POST', body: {} })
    return print({ ...data, transport: 'http' })
  }

  throw new Error(`未知命令: ${command}（用 --help 查看）`)
}

main().catch((error) => {
  const payload = { ok: false, error: { code: error.code || 'FAILED', message: error.message } }
  if (json) process.stderr.write(`${JSON.stringify(payload)}\n`)
  else process.stderr.write(`SIGNAL error: ${error.message}\n`)
  process.exitCode = 2
})

