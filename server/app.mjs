import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { config } from './config.mjs'
import { api } from './routes/api.mjs'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.use((req, res, next) => {
    if (!config.accessToken) return next()
    const header = req.get('authorization') || ''
    const token = header.replace(/^Bearer\s+/i, '') || req.query.token
    if (token === config.accessToken) return next()
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHORIZED', message: '缺少或错误的访问令牌' } })
  })

  app.get('/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }))
  app.use('/api', api)

  const dist = path.join(config.root, 'client', 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, fallthrough: true, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
      return res.sendFile(path.join(dist, 'index.html'))
    })
  } else {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      return res
        .status(200)
        .type('text/plain; charset=utf-8')
        .send('SIGNAL 前端尚未构建。开发模式请访问 http://127.0.0.1:5173 ，或运行 npm run build。')
    })
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
  })

  app.use((err, _req, res, _next) => {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500
    if (status >= 500) console.error('[api]', err)
    res.status(status).json({
      error: {
        code: status === 500 ? 'INTERNAL' : 'REQUEST_FAILED',
        message: err.message || '服务器内部错误'
      }
    })
  })

  return app
}
