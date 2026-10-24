#!/usr/bin/env node
import { all, closeDb, get, nowIso, run } from '../db/index.mjs'
import { runScanNow } from '../scheduler/scheduler.mjs'
import { config } from '../config.mjs'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const json = args.includes('--json')

function print(data) {
  if (json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  } else if (typeof data === 'string') {
    process.stdout.write(`${data}\n`)
  } else {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  }
}

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : true
}

async function main() {
  if (command === 'status') {
    return print({
      ok: true,
      version: '0.1.0',
      scanIntervalSec: config.scanIntervalSec,
      verifyMode: config.verifyMode,
      sources: all('SELECT kind, name, health, enabled, last_fetch_at FROM sources'),
      counts: {
        events: get('SELECT COUNT(*) AS c FROM events').c,
        alerts: get('SELECT COUNT(*) AS c FROM alerts').c,
        watches: get('SELECT COUNT(*) AS c FROM watches').c
      }
    })
  }

  if (command === 'scan') {
    const scope = option('watch')
      ? `watch:${option('watch')}`
      : option('topic')
        ? `topic:${option('topic')}`
        : 'all'
    const job = await runScanNow(scope)
    return print({
      ok: job.status === 'done',
      job: {
        id: job.id,
        status: job.status,
        processed: job.processed,
        total: job.total,
        errors: job.errors
      }
    })
  }

  if (command === 'hotspots') {
    const rawSince = String(option('since', '24h'))
    const amount = Number.parseInt(rawSince, 10) || 24
    const sinceHours = rawSince.endsWith('d') ? amount * 24 : amount
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()
    const min = Number(option('min-credibility', 0.65))
    const rows = all(
      `SELECT id, title, verdict, credibility, heat, independent_domains, first_seen_at
       FROM events WHERE last_updated_at >= ? AND credibility >= ?
       ORDER BY heat DESC LIMIT ?`,
      since,
      min,
      Number(option('limit', 20))
    )
    return print({ ok: true, verifyMode: config.verifyMode, count: rows.length, data: rows })
  }

  if (command === 'watch') {
    const sub = args[1]
    if (sub === 'list' || !sub) {
      return print({ ok: true, data: all('SELECT * FROM watches ORDER BY id') })
    }
    if (sub === 'add') {
      const keyword = args[2]
      if (!keyword) throw new Error('用法: radar watch add "<keyword>" [--aliases a,b]')
      const aliases = String(option('aliases', ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const excludes = String(option('exclude', ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const result = run(
        `INSERT INTO watches(keyword, aliases, exclude_terms, min_credibility, interval_sec, channels, enabled, created_at)
         VALUES(?, ?, ?, ?, ?, ?, 1, ?)`,
        keyword,
        JSON.stringify(aliases),
        JSON.stringify(excludes),
        Number(option('min-credibility', 0.65)),
        Number(option('interval', 1800)),
        JSON.stringify(['inpage', 'email']),
        nowIso()
      )
      return print({ ok: true, id: Number(result.lastInsertRowid), keyword })
    }
    if (sub === 'remove') {
      const target = args[2]
      if (!target) throw new Error('用法: radar watch remove <id|keyword>')
      const row = get('SELECT * FROM watches WHERE id = ? OR keyword = ?', Number(target) || -1, target)
      if (row) run('DELETE FROM watches WHERE id = ?', row.id)
      return print({ ok: true, removed: row || null })
    }
  }

  if (command === 'sources') {
    return print({
      ok: true,
      data: all('SELECT id, kind, name, url, weight, enabled, health, last_fetch_at, fail_count FROM sources ORDER BY kind, name')
    })
  }

  if (command === 'brief') {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const rows = all(
      `SELECT title, summary, verdict, credibility, independent_domains
       FROM events WHERE last_updated_at >= ? AND verdict IN ('verified','likely')
       ORDER BY heat DESC LIMIT 10`,
      since
    )
    if (option('md')) {
      const md = [
        `# SIGNAL 简报 · ${new Date().toISOString().slice(0, 10)}`,
        '',
        ...rows.map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   - 可信度 ${Math.round(r.credibility * 100)} · ${r.independent_domains} 个独立来源\n   - ${r.summary || ''}`
        )
      ].join('\n')
      process.stdout.write(`${md}\n`)
      return
    }
    return print({ ok: true, data: rows })
  }

  print(`SIGNAL Radar CLI
用法:
  radar status
  radar scan [--watch <id>] [--topic <id>]
  radar hotspots [--since 24h] [--min-credibility 0.65] [--limit 20]
  radar watch list
  radar watch add "<keyword>" [--aliases a,b] [--exclude x,y]
  radar watch remove <id|keyword>
  radar brief [--md]
通用参数: --json`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => {
    closeDb()
  })
