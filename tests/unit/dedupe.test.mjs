import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eventKey,
  isSameEventTitle,
  jaccard,
  titleSimilarity,
  trigrams
} from '../../server/core/dedupe.mjs'

test('trigrams 与 jaccard 基础', () => {
  const a = trigrams('openai releases gpt5')
  const b = trigrams('openai releases gpt5')
  assert.equal(jaccard(a, b), 1)
  assert.equal(titleSimilarity('OpenAI releases GPT-5', 'OpenAI releases GPT-5'), 1)
})

test('相似标题可合并，不同事件不合并', () => {
  const same = [
    'OpenAI releases GPT-5.2 with better coding',
    'OpenAI releases GPT-5.2 with better coding!'
  ]
  assert.equal(isSameEventTitle(same[0], same[1]), true)
  assert.equal(
    isSameEventTitle('OpenAI releases GPT-5.2', 'Anthropic hires new CFO'),
    false
  )
})

test('eventKey 同日稳定、跨日不同', () => {
  const day1 = '2026-10-24T08:00:00Z'
  const day1later = '2026-10-24T20:00:00Z'
  const day2 = '2026-10-25T08:00:00Z'
  const a = eventKey('OpenAI releases GPT-5.2', day1)
  const b = eventKey('OpenAI releases GPT-5.2', day1later)
  const c = eventKey('OpenAI releases GPT-5.2', day2)
  assert.equal(a, b)
  assert.notEqual(a, c)
})
