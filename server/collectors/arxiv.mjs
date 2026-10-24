import { fetchText } from './http.mjs'
import { parseFeed } from './xml.mjs'

const QUERY =
  'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG' +
  '&sortBy=submittedDate&sortOrder=descending&max_results=50'

export async function collectArxiv() {
  const res = await fetchText(QUERY, { minGapMs: 3000, timeoutMs: 20000 })
  return parseFeed(res.text).map((item) => ({
    ...item,
    platform: 'web',
    domain: 'arxiv.org',
    isFirstParty: false,
    metrics: {}
  }))
}
