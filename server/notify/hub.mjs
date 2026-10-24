const clients = new Set()
const buffer = []
const MAX_BUFFER = 100
let sequence = 0

function write(res, event, data, id) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  res.write(`${lines.join('\n')}\n\n`)
}

export function subscribe(req, res, { unread = 0 } = {}) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders?.()

  const lastId = Number(req.headers['last-event-id'] || req.query.lastEventId || 0)
  const client = { res, lastId }
  clients.add(client)

  const replay = lastId ? buffer.filter((entry) => entry.id > lastId) : []
  if (replay.length) {
    for (const entry of replay) res.write(entry.raw)
  } else {
    write(res, 'hello', { serverTime: new Date().toISOString(), unread }, ++sequence)
  }

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return
    write(res, 'ping', { t: Date.now() }, ++sequence)
  }, 25000)

  const cleanup = () => {
    clearInterval(heartbeat)
    clients.delete(client)
  }
  req.on('close', cleanup)
  req.on('error', cleanup)
  res.on('error', cleanup)
}

export function publish(event, data) {
  const id = ++sequence
  const raw = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  buffer.push({ id, raw })
  while (buffer.length > MAX_BUFFER) buffer.shift()
  for (const client of [...clients]) {
    try {
      if (!client.res.writableEnded) client.res.write(raw)
    } catch {
      clients.delete(client)
    }
  }
  return id
}

export function clientCount() {
  return clients.size
}

export function resetHub() {
  for (const client of clients) {
    try {
      client.res.end()
    } catch {
      // ignore
    }
  }
  clients.clear()
  buffer.length = 0
}
