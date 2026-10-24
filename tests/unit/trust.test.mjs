import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isImpersonationHandle,
  isMediaDomain,
  isOfficialDomain,
  isTyposquat,
  itemTrust,
  registrableDomain,
  rumorSignal
} from '../../server/core/trust.mjs'

test('注册域提取', () => {
  assert.equal(registrableDomain('blog.openai.com'), 'openai.com')
  assert.equal(registrableDomain('news.qq.com'), 'qq.com')
  assert.equal(registrableDomain('foo.com.cn'), 'foo.com.cn')
})

test('官方域名与媒体域名', () => {
  assert.equal(isOfficialDomain('openai.com'), true)
  assert.equal(isOfficialDomain('blog.google'), true)
  assert.equal(isOfficialDomain('openai.co'), false)
  assert.equal(isMediaDomain('techcrunch.com'), true)
})

test('仿冒域名检测', () => {
  assert.equal(isTyposquat('openai.co'), true)
  assert.equal(isTyposquat('openai.com'), false)
  assert.equal(isTyposquat('openai-news.com'), true)
})

test('高仿账号检测', () => {
  assert.equal(isImpersonationHandle('OpenA1'), true)
  assert.equal(isImpersonationHandle('OpenAI'), false)
  assert.equal(isImpersonationHandle('random_dev'), false)
})

test('来源权重', () => {
  assert.equal(itemTrust({ domain: 'openai.com' }, { kind: 'rss', weight: 1 }), 1)
  assert.equal(itemTrust({ domain: 'techcrunch.com' }, { kind: 'rss', weight: 0.72 }), 0.72)
  assert.equal(
    itemTrust({ domain: 'github.com', is_first_party: 1 }, { kind: 'github', weight: 0.9 }),
    0.9
  )
  assert.equal(
    itemTrust({ domain: 'x.com', author_handle: 'OpenAI' }, { kind: 'x', weight: 0.35 }),
    0.95
  )
  assert.equal(
    itemTrust({ domain: 'x.com', author_handle: 'someone' }, { kind: 'x', weight: 0.35 }),
    0.35
  )
})

test('传闻词信号', () => {
  assert.ok(rumorSignal('据传 OpenAI 将发布新模型') >= 0.25)
  assert.equal(rumorSignal('OpenAI 发布新模型'), 0)
})
