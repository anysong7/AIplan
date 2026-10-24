export const VERDICT = {
  verified: { label: '已核实', short: 'VERIFIED', tone: 'verified' },
  likely: { label: '较可信', short: 'LIKELY', tone: 'likely' },
  unverified: { label: '未证实', short: 'UNVERIFIED', tone: 'unverified' },
  suspicious: { label: '疑似不实', short: 'SUSPICIOUS', tone: 'suspicious' }
}

export function verdictOf(value) {
  return VERDICT[value] || VERDICT.unverified
}

export function pct(value, digits = 0) {
  const n = Number(value || 0) * 100
  return `${n.toFixed(digits)}`
}

export function timeAgo(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export function clock(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
