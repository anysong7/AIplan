import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEmail } from '../../server/notify/email-template.mjs'

const payload = {
  title: 'OpenAI <script>alert(1)</script> 发布 GPT-5.2',
  summary: '官方博客称在 SWE-bench 上提升。',
  credibility: 0.92,
  independentDomains: 3,
  verdict: 'verified',
  target: 'GPT-5',
  sources: [
    { domain: 'openai.com', url: 'https://openai.com/x', firstParty: true },
    { domain: 'techcrunch.com', url: 'https://techcrunch.com/y' }
  ],
  readUrl: 'http://127.0.0.1:8787/#/event/1'
}

test('邮件主题包含判定与标题', () => {
  const mail = buildEmail([payload])
  assert.match(mail.subject, /已核实/)
  assert.match(mail.subject, /OpenAI/)
})

test('HTML 转义，不执行注入', () => {
  const mail = buildEmail([payload])
  assert.equal(mail.html.includes('<script>alert(1)</script>'), false)
  assert.ok(mail.html.includes('&lt;script&gt;'))
})

test('同时提供纯文本版本与来源链接', () => {
  const mail = buildEmail([payload])
  assert.ok(mail.text.includes('可信度 92'))
  assert.ok(mail.text.includes('https://openai.com/x'))
  assert.ok(mail.html.includes('openai.com'))
})

test('多封合并为一封', () => {
  const mail = buildEmail([payload, { ...payload, title: '第二条' }])
  assert.match(mail.subject, /2 条新热点/)
  assert.ok(mail.html.includes('第二条'))
})
