import { spawn } from 'node:child_process'
import process from 'node:process'

const children = []

function run(label, command, args, color) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = `\u001b[${color}m[${label}]\u001b[0m `
  child.stdout.on('data', (d) => process.stdout.write(prefix + d.toString()))
  child.stderr.on('data', (d) => process.stderr.write(prefix + d.toString()))
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`${prefix}exited with ${code}\n`)
    }
  })
  children.push(child)
  return child
}

run('server', process.execPath, ['--watch', 'server/server.mjs'], '36')
run('web', process.execPath, ['node_modules/vite/bin/vite.js'], '35')

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
