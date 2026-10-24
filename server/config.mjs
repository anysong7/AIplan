import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let [, key, value] = m
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv(path.join(root, '.env'))

const str = (key, fallback = '') => (process.env[key] ?? fallback).trim()
const num = (key, fallback) => {
  const n = Number(process.env[key])
  return Number.isFinite(n) ? n : fallback
}
const bool = (key, fallback = false) => {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  return /^(1|true|yes|on)$/i.test(v)
}
const list = (key, fallback = []) => {
  const v = str(key)
  if (!v) return fallback
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

const port = num('PORT', 8787)
const host = str('HOST', '127.0.0.1')

export const config = {
  root,
  env: str('NODE_ENV', 'development'),
  port,
  host,
  accessToken: str('ACCESS_TOKEN'),
  baseUrl: str('BASE_URL', `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`),
  tz: str('TZ', 'Asia/Shanghai'),
  dbPath: path.resolve(root, str('DB_PATH', './data/radar.db')),
  logLevel: str('LOG_LEVEL', 'info'),

  scanIntervalSec: num('SCAN_INTERVAL_SEC', 1800),
  schedulerEnabled: bool('SCHEDULER_ENABLED', true),
  requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 10000),
  maxConcurrency: num('MAX_CONCURRENCY', 4),

  githubToken: str('GITHUB_TOKEN'),
  githubRepos: list('GITHUB_REPOS', [
    'openai/openai-python',
    'langchain-ai/langchain',
    'vllm-project/vllm',
    'ollama/ollama',
    'ggml-org/llama.cpp',
    'modelcontextprotocol/servers',
    'huggingface/transformers'
  ]),
  rssFeeds: list('RSS_FEEDS', [
    'openai|https://openai.com/news/rss.xml|official',
    'google-ai|https://blog.google/technology/ai/rss/|official',
    'deepmind|https://deepmind.google/blog/rss.xml|official',
    'huggingface|https://huggingface.co/blog/feed.xml|official',
    'techcrunch-ai|https://techcrunch.com/category/artificial-intelligence/feed/|media',
    'verge-ai|https://www.theverge.com/rss/ai-artificial-intelligence/index.xml|media',
    'qbitai|https://www.qbitai.com/feed|media',
    'jiqizhixin|https://www.jiqizhixin.com/rss|media',
    'infoq-cn|https://www.infoq.cn/feed|media'
  ]),
  crawlSites: list('CRAWL_SITES', ['https://www.anthropic.com']),
  crawlMaxPages: num('CRAWL_MAX_PAGES', 20),
  crawlDelayMs: num('CRAWL_DELAY_MS', 2000),
  gdeltEnabled: bool('GDELT_ENABLED', false),

  xEnabled: bool('X_ENABLED', false),
  xPollIntervalSec: num('X_POLL_INTERVAL_SEC', 1800),
  xDailyBudgetUsd: num('X_DAILY_BUDGET_USD', 1),
  twitterApiKey: str('TWITTERAPI_KEY'),
  xOfficialAccounts: list('X_OFFICIAL_ACCOUNTS', [
    'OpenAI',
    'AnthropicAI',
    'GoogleDeepMind',
    'huggingface',
    'MetaAI',
    'MistralAI',
    'deepseek_ai',
    'Alibaba_Qwen'
  ]),

  verifyMode: str('VERIFY_MODE', 'rules'),
  aiEnabled: bool('AI_ENABLED', false),
  openrouterApiKey: str('OPENROUTER_API_KEY'),
  openrouterModel: str('OPENROUTER_MODEL', 'google/gemini-2.5-flash'),
  pushMinCredibility: num('PUSH_MIN_CREDIBILITY', 0.65),
  pushMinDomains: num('PUSH_MIN_DOMAINS', 2),
  alertMaxPerWatchPerHour: num('ALERT_MAX_PER_WATCH_PER_HOUR', 5),
  alertMaxPerWatchPerDay: num('ALERT_MAX_PER_WATCH_PER_DAY', 30),

  inpageEnabled: bool('INPAGE_ENABLED', true),
  inpageToastMs: num('INPAGE_TOAST_MS', 4800),
  inpageModalMinScore: num('INPAGE_MODAL_MIN_SCORE', 0.88),
  inpageSound: bool('INPAGE_SOUND', false),

  mailEnabled: bool('MAIL_ENABLED', true),
  mailTransport: str('MAIL_TRANSPORT', 'ethereal'),
  mailTo: str('MAIL_TO', 'anysong7@163.com'),
  mailFrom: str('MAIL_FROM', 'SIGNAL Radar <radar@localhost>'),
  mailMergeWindowSec: num('MAIL_MERGE_WINDOW_SEC', 120),
  mailMaxPerHour: num('MAIL_MAX_PER_HOUR', 5),
  mailMaxPerDay: num('MAIL_MAX_PER_DAY', 20),
  mailQuietHours: str('MAIL_QUIET_HOURS'),
  smtp: {
    host: str('SMTP_HOST'),
    port: num('SMTP_PORT', 465),
    secure: bool('SMTP_SECURE', true),
    user: str('SMTP_USER'),
    pass: str('SMTP_PASS')
  }
}

export function masked(value) {
  if (!value) return ''
  return value.length <= 4 ? '******' : `${value.slice(0, 2)}******${value.slice(-2)}`
}
