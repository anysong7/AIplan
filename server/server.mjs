import { createApp } from './app.mjs'
import { config } from './config.mjs'
import { all, closeDb, getSetting, run } from './db/index.mjs'
import { startScheduler, stopScheduler } from './scheduler/scheduler.mjs'
import { verifyMail } from './notify/mail.mjs'
import { enqueueEmail } from './notify/email-queue.mjs'

const overrides = getSetting('overrides', {}) || {}
for (const [key, value] of Object.entries(overrides)) {
  if (value !== undefined && value !== null && value !== '') config[key] = value
}

// 进程异常退出后，恢复未完成的邮件任务
run("UPDATE notifications SET status = 'queued' WHERE channel = 'email' AND status = 'sending'")
for (const row of all(
  "SELECT * FROM notifications WHERE channel = 'email' AND status = 'queued' ORDER BY id ASC LIMIT 50"
)) {
  try {
    enqueueEmail(row.id, JSON.parse(row.payload_json || '{}'))
  } catch {
    // 单条损坏不影响启动
  }
}

const app = createApp()
const server = app.listen(config.port, config.host, () => {
  console.log(`[signal] http://${config.host}:${config.port}  (verify=${config.verifyMode})`)
  if (config.schedulerEnabled) startScheduler()
})

verifyMail().then((result) => {
  if (!result.ok) console.warn(`[signal] 邮件通道不可用 (${result.mode}): ${result.error}`)
})

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  console.log('[signal] shutting down')
  stopScheduler()
  server.close(() => {
    closeDb()
    process.exit(code)
  })
  setTimeout(() => process.exit(code), 5000).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
process.on('unhandledRejection', (err) => {
  console.error('[signal] unhandledRejection', err)
})
process.on('uncaughtException', (err) => {
  console.error('[signal] uncaughtException', err)
})
