import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQuery,
  matchTopic,
  matchWatch,
  termMatches
} from '../../server/core/keywords.mjs'

test('英文词边界：ai 不命中 said', () => {
  assert.equal(termMatches('this is said', 'ai'), false)
  assert.equal(termMatches('AI coding is fun', 'AI'), true)
  assert.equal(termMatches('OpenAI releases', 'AI'), false)
})

test('中文子串匹配', () => {
  assert.equal(termMatches('OpenAI 发布新模型', '发布'), true)
  assert.equal(termMatches('OpenAI 发布新模型', '开源'), false)
})

test('别名命中与排除词优先', () => {
  const watch = {
    keyword: 'GPT-5',
    aliases: '["gpt5","gpt 5"]',
    exclude_terms: '["招聘"]'
  }
  assert.equal(matchWatch('OpenAI 发布 GPT5', watch).matched, true)
  assert.equal(matchWatch('GPT-5 招聘研究员', watch).matched, false)
})

test('Topic 多查询命中', () => {
  const topic = { queries: '["AI 编程","Cursor"]' }
  assert.equal(matchTopic('Cursor 发布新版本', topic).matched, true)
  assert.equal(matchTopic('气候政策', topic).matched, false)
})

test('buildQuery 转义与 OR 合并', () => {
  assert.equal(buildQuery(['GPT-5', 'AI coding']), 'GPT-5 OR "AI coding"')
  assert.equal(buildQuery(['a', '', null]), 'a')
})
