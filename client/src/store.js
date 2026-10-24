import Vue from 'vue'
import { api } from './api.js'

const state = Vue.observable({
  ready: false,
  status: null,
  topics: [],
  watches: [],
  events: [],
  total: 0,
  sources: [],
  notifications: [],
  usage: [],
  selectedId: null,
  detail: null,
  detailLoading: false,
  filters: { topic: '', since: '72h', minCredibility: 0.65, platform: '', q: '' },
  loadingEvents: false,
  unread: 0,
  toasts: [],
  modal: null,
  stream: 'connecting',
  scan: { running: false, jobId: null, phase: '', processed: 0, total: 0, errors: [] },
  error: null
})

const toastTimers = new Map()

function scheduleDismiss(id, duration) {
  const timer = setTimeout(() => {
    removeToast(id)
  }, duration)
  toastTimers.set(id, timer)
}

export function pauseToast(id) {
  const timer = toastTimers.get(id)
  if (timer) clearTimeout(timer)
  toastTimers.delete(id)
}

export function resumeToast(id, remaining = 2200) {
  if (toastTimers.has(id)) return
  scheduleDismiss(id, remaining)
}

export function removeToast(id) {
  const timer = toastTimers.get(id)
  if (timer) clearTimeout(timer)
  toastTimers.delete(id)
  state.toasts = state.toasts.filter((t) => t.id !== id)
}

let toastSeq = 0
export function pushToast(payload) {
  const id = ++toastSeq
  const toast = {
    id,
    eventId: payload.eventId,
    alertId: payload.alertId,
    title: payload.title || '新热点',
    summary: payload.summary || '',
    score: payload.score || 0,
    verdict: payload.verdict || 'unverified',
    target: payload.target || '',
    duration: payload.toastMs || 4800
  }
  state.toasts = [toast, ...state.toasts].slice(0, 3)
  scheduleDismiss(id, toast.duration)
  return id
}

export async function loadStatus() {
  try {
    const data = await api.status()
    state.status = data
    state.unread = data.counts?.unread || 0
    state.sources = data.sources || []
  } catch (err) {
    state.error = err.message
  }
}

export async function loadSources() {
  try {
    const data = await api.sources()
    state.sources = data.items || []
  } catch {
    // keep previous
  }
}

export async function loadEvents() {
  state.loadingEvents = true
  try {
    const data = await api.hotspots({ ...state.filters, limit: 80 })
    state.events = data.items || []
    state.total = data.total || 0
  } catch (err) {
    state.error = err.message
  } finally {
    state.loadingEvents = false
  }
}

function safeArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function loadWatches() {
  try {
    const data = await api.watches()
    state.watches = (data.items || []).map((w) => ({
      ...w,
      aliases: safeArray(w.aliases),
      exclude_terms: safeArray(w.exclude_terms),
      channels: safeArray(w.channels)
    }))
  } catch (err) {
    state.error = err.message
  }
}

export async function loadTopics() {
  try {
    const data = await api.topics()
    state.topics = (data.items || []).map((t) => ({ ...t, queries: safeArray(t.queries) }))
  } catch {
    // keep previous
  }
}

export async function loadNotifications() {
  try {
    const data = await api.notifications()
    state.notifications = data.items || []
  } catch {
    // keep previous
  }
}

export async function loadUsage() {
  try {
    const data = await api.usage()
    state.usage = data.items || []
  } catch {
    // keep previous
  }
}

export async function init() {
  await Promise.all([loadStatus(), loadTopics(), loadWatches(), loadSources(), loadNotifications()])
  await loadEvents()
  state.ready = true
}

export function setFilter(patch) {
  state.filters = { ...state.filters, ...patch }
  return loadEvents()
}

export async function selectEvent(id) {
  state.selectedId = Number(id)
  state.detailLoading = true
  try {
    state.detail = await api.event(id)
  } catch (err) {
    state.error = err.message
    state.detail = null
  } finally {
    state.detailLoading = false
  }
}

export function closeDetail() {
  state.selectedId = null
  state.detail = null
}

export async function markDetailRead() {
  const alerts = state.detail?.alerts || []
  for (const alert of alerts) {
    if (!alert.read_at) {
      try {
        await api.readAlert(alert.id)
      } catch {
        // ignore
      }
    }
  }
  await loadStatus()
  if (state.detail) {
    state.detail = {
      ...state.detail,
      alerts: alerts.map((a) => ({ ...a, read_at: a.read_at || new Date().toISOString() }))
    }
  }
}

export async function readAll() {
  await api.readAll()
  state.unread = 0
  await loadStatus()
}

export async function addWatch(body) {
  const result = await api.addWatch(body)
  await Promise.all([loadWatches(), loadStatus()])
  await loadEvents()
  return result
}

export async function updateWatch(id, body) {
  await api.updateWatch(id, body)
  await loadWatches()
}

export async function removeWatch(id) {
  await api.removeWatch(id)
  await loadWatches()
  await loadStatus()
}

async function pollJob(jobId) {
  for (let i = 0; i < 80; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const { job } = await api.job(jobId)
    state.scan = {
      running: job.status === 'running',
      jobId,
      phase: job.phase,
      processed: job.processed,
      total: job.total,
      errors: job.errors || []
    }
    if (job.status !== 'running') break
  }
  state.scan.running = false
  await Promise.all([loadEvents(), loadStatus(), loadSources()])
}

export async function scan(scope = 'all') {
  if (state.scan.running) return
  state.scan = { running: true, jobId: null, phase: 'starting', processed: 0, total: 0, errors: [] }
  try {
    const { jobId } = await api.scan(scope)
    state.scan.jobId = jobId
    await pollJob(jobId)
  } catch (err) {
    state.scan = { ...state.scan, running: false, errors: [err.message] }
    pushToast({ title: '扫描失败', summary: err.message, verdict: 'suspicious', score: 0 })
  }
}

export function handleStreamEvent(name, payload) {
  if (name === 'alert.new') {
    state.unread += 1
    pushToast(payload)
    if (payload.score >= (payload.modalMinScore || 0.88)) state.modal = payload
    loadEvents()
    loadStatus()
  }
  if (name === 'scan.progress') {
    state.scan = {
      running: payload.status === 'running',
      jobId: payload.id,
      phase: payload.phase,
      processed: payload.processed,
      total: payload.total,
      errors: payload.errors || []
    }
  }
  if (name === 'source.health') loadSources()
  if (name === 'notification.update') loadNotifications()
}

export function setStream(status) {
  state.stream = status
}

export function dismissModal() {
  state.modal = null
}

export async function testEmail() {
  return api.testEmail()
}

export const store = {
  state,
  init,
  loadStatus,
  loadEvents,
  loadWatches,
  loadTopics,
  loadSources,
  loadNotifications,
  loadUsage,
  setFilter,
  selectEvent,
  closeDetail,
  markDetailRead,
  readAll,
  addWatch,
  updateWatch,
  removeWatch,
  scan,
  handleStreamEvent,
  setStream,
  pushToast,
  removeToast,
  pauseToast,
  resumeToast,
  dismissModal,
  testEmail
}

