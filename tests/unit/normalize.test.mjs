import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalUrl,
  normalizeText,
  stripHtml,
  truncate,
  urlHash
} from '../../server/core/normalize.mjs'

test('normalizeText: NFKC、大小写、空白与零宽字符', () => {
  assert.equal(normalizeText('  ＧＰＴ－５  '), 'gpt-5')
  assert.equal(normalizeText('OpenAI\u200b  GPT'), 'openai gpt')
})

test('canonicalUrl: 去 tracking、fragment 与尾斜杠', () => {
  const url = canonicalUrl('https://Example.com/news/?utm_source=x&utm_medium=y&id=1#top')
  assert.equal(url, 'https://example.com/news?id=1')
})

test('canonicalUrl: 非法输入原样返回', () => {
  assert.equal(canonicalUrl('not a url'), 'not a url')
  assert.equal(canonicalUrl(''), '')
})

test('urlHash: 同一 canonical URL 稳定', () => {
  assert.equal(
    urlHash('https://example.com/a/?utm_source=x'),
    urlHash('https://example.com/a/')
  )
  assert.notEqual(urlHash('https://example.com/a'), urlHash('https://example.com/b'))
})

test('stripHtml: 去除标签与实体', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world')
})

test('truncate: 超长截断并加省略号', () => {
  assert.equal(truncate('abcdef', 3), 'abc…')
  assert.equal(truncate('abc', 3), 'abc')
})
