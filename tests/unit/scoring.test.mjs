import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canPush,
  computeEventMetrics,
  eventVerdict,
  metricScore
} from '../../server/core/scoring.mjs'
import { rumorSignal } from '../../server/core/trust.mjs'

function item(overrides = {}) {
  return {
    source_id: 1,
    title: 'OpenAI releases GPT-5.2',
    excerpt: 'official announcement',
    domain: 'openai.com',
    is_first_party: 1,
    published_at: new Date().toISOString(),
    metrics_json: null,
    ...overrides
  }
}

const officialSource = new Map([[1, { kind: 'rss', weight: 1 }]])

test('单一官方来源：可推送', () => {
  const metrics = computeEventMetrics([item()], officialSource)
  assert.equal(metrics.sourceTrust, 1)
  assert.equal(metrics.independentDomains, 1)
  assert.equal(metrics.credibility, 0.7667)
  assert.equal(eventVerdict(metrics), 'verified')
  assert.equal(canPush(metrics, 0.65, 2), true)
})

test('单一未知来源：不可推送', () => {
  const metrics = computeEventMetrics(
    [item({ domain: 'unknown-blog.example', is_first_party: 0, title: 'OpenAI releases GPT-6' })],
    new Map([[1, { kind: 'rss', weight: 0.45 }]])
  )
  assert.equal(metrics.credibility, 0.5192)
  assert.equal(eventVerdict(metrics), 'unverified')
  assert.equal(canPush(metrics, 0.65, 2), false)
})

test('两个独立媒体来源：可推送', () => {
  const metrics = computeEventMetrics(
    [
      item({ domain: 'techcrunch.com', is_first_party: 0 }),
      item({ domain: 'theverge.com', is_first_party: 0 })
    ],
    new Map([[1, { kind: 'rss', weight: 0.72 }]])
  )
  assert.equal(metrics.independentDomains, 2)
  assert.ok(metrics.credibility >= 0.75)
  assert.equal(eventVerdict(metrics), 'likely')
  assert.equal(canPush(metrics, 0.65, 2), true)
})

test('高仿账号：永不推送', () => {
  const metrics = computeEventMetrics(
    [
      item({
        domain: 'x.com',
        source_id: 1,
        is_first_party: 0,
        author_handle: 'OpenA1'
      })
    ],
    new Map([[1, { kind: 'x', weight: 0.35 }]])
  )
  assert.equal(metrics.impersonation, true)
  assert.equal(eventVerdict(metrics), 'suspicious')
  assert.equal(canPush(metrics, 0.5, 1), false)
})

test('热度指标：互动量对数归一', () => {
  assert.equal(metricScore(null), 0)
  assert.ok(metricScore({ points: 100, likes: 50 }) > 0)
  assert.ok(metricScore({ points: 1000000 }) <= 1)
})

test('传闻信号影响可信度', () => {
  const base = computeEventMetrics([item()], officialSource)
  const rumor = computeEventMetrics(
    [item({ title: '据传 OpenAI 将发布 GPT-5.2', excerpt: '未经证实' })],
    officialSource
  )
  assert.ok(rumor.rumor > base.rumor)
  assert.ok(rumor.credibility < base.credibility)
})

test('rumorSignal 上限 1', () => {
  assert.ok(rumorSignal('据传 爆料 疑似 或将 内部消息 rumor leak reportedly') <= 1)
})
