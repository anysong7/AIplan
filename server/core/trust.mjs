const OFFICIAL_DOMAINS = new Set([
  'openai.com',
  'anthropic.com',
  'blog.google',
  'deepmind.google',
  'ai.meta.com',
  'mistral.ai',
  'deepseek.com',
  'qwen.ai',
  'x.ai',
  'huggingface.co'
])

const MEDIA_DOMAINS = new Set([
  'techcrunch.com',
  'theverge.com',
  'venturebeat.com',
  'technologyreview.com',
  'arstechnica.com',
  'wired.com',
  'qbitai.com',
  'jiqizhixin.com',
  'infoq.cn',
  '36kr.com',
  'huxiu.com',
  'thepaper.cn',
  'sina.com.cn',
  'sohu.com',
  '163.com'
])

const OFFICIAL_HANDLES = new Set(
  [
    'OpenAI',
    'AnthropicAI',
    'GoogleDeepMind',
    'huggingface',
    'MetaAI',
    'MistralAI',
    'deepseek_ai',
    'Alibaba_Qwen',
    'xai',
    'sama',
    'karpathy'
  ].map((h) => h.toLowerCase())
)

const TRUST_WORDS = /(据传|爆料|疑似|或将|内部消息|消息人士|未经证实|rumou?r|leak|reportedly|just in)/gi
const CLICKBAIT = /(震惊|重磅|炸裂|史上最强|颠覆|!!!|！{2,})/

export function levenshtein(a = '', b = '') {
  const s = String(a)
  const t = String(b)
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i)
  for (let i = 1; i <= s.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[t.length]
}

export function registrableDomain(domain = '') {
  const parts = String(domain).toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const twoLevel = ['com.cn', 'net.cn', 'org.cn', 'co.uk', 'co.jp', 'com.au']
  const lastTwo = parts.slice(-2).join('.')
  if (twoLevel.includes(lastTwo)) return parts.slice(-3).join('.')
  return lastTwo
}

export function isOfficialDomain(domain) {
  const d = registrableDomain(domain)
  return OFFICIAL_DOMAINS.has(d) || OFFICIAL_DOMAINS.has(String(domain).toLowerCase())
}

export function isMediaDomain(domain) {
  const d = registrableDomain(domain)
  return MEDIA_DOMAINS.has(d) || MEDIA_DOMAINS.has(String(domain).toLowerCase())
}

export function isTyposquat(domain) {
  const d = registrableDomain(domain)
  if (!d || isOfficialDomain(d)) return false
  for (const official of OFFICIAL_DOMAINS) {
    if (levenshtein(d, official) <= 1) return true
    const brand = official.split('.')[0]
    if (d.startsWith(`${brand}-`)) return true
  }
  return false
}

export function isImpersonationHandle(handle) {
  const h = String(handle || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!h) return false
  for (const official of OFFICIAL_HANDLES) {
    if (h === official) return false
    if (levenshtein(h, official) <= 2) return true
  }
  return false
}

export function isOfficialHandle(handle) {
  return OFFICIAL_HANDLES.has(String(handle || '').toLowerCase())
}

export function itemTrust(item, source = {}) {
  const kind = source.kind || item.kind || 'rss'
  const baseWeight = Number(source.weight ?? 0.5)
  const domain = item.domain || ''

  if (isTyposquat(domain)) return 0.2
  if (kind === 'x') {
    if (isOfficialHandle(item.author_handle)) return 0.95
    if (item.author_verified) return 0.7
    return 0.35
  }
  if (isOfficialDomain(domain)) return 1
  if (item.is_first_party) return Math.max(baseWeight, 0.9)
  if (isMediaDomain(domain)) return Math.max(baseWeight, 0.72)
  return baseWeight
}

export function rumorSignal(text = '') {
  let score = 0
  const matches = String(text).match(TRUST_WORDS) || []
  score += Math.min(0.6, matches.length * 0.25)
  if (/\?{1,}/.test(text)) score += 0.05
  if (CLICKBAIT.test(text)) score += 0.1
  if (String(text).length > 12 && /\b[A-Z]{4,}(\s+[A-Z]{2,}){2,}\b/.test(text)) score += 0.05
  return Math.min(1, Number(score.toFixed(2)))
}

export function typosquatFlag(domain) {
  return isTyposquat(domain)
}

export const trustConfig = {
  OFFICIAL_DOMAINS,
  MEDIA_DOMAINS,
  OFFICIAL_HANDLES
}
