import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBingLink } from '../../server/collectors/bing.mjs'

test('Bing apiclick 链接解码到原文', () => {
  const link =
    'https://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=abc&url=https%3A%2F%2Fopenai.com%2Findex%2Fgpt-5-2&c=123'
  assert.equal(decodeBingLink(link), 'https://openai.com/index/gpt-5-2')
})

test('普通链接原样返回', () => {
  assert.equal(decodeBingLink('https://openai.com/news/a'), 'https://openai.com/news/a')
})

test('异常链接不抛错', () => {
  assert.equal(decodeBingLink('not a url'), 'not a url')
})
