import { config } from '../config.mjs'
import { todayUsage, upsertUsage } from '../db/index.mjs'
import { fetchJson } from './http.mjs'
import { parseDate, truncate } from '../core/normalize.mjs'
import { isOfficialHandle } from '../core/trust.mjs'

export async function collectX(source, query) {
  if (!config.xEnabled || !config.twitterApiKey || !query) return []
  const usage = todayUsage('x')
  if (Number(usage.cost_usd) >= config.xDailyBudgetUsd) return []

  const url = new URL(source.url)
  url.searchParams.set('query', query)
  url.searchParams.set('queryType', 'Latest')

  const { data } = await fetchJson(url.toString(), {
    headers: { 'X-API-Key': config.twitterApiKey },
    minGapMs: 1000,
    timeoutMs: 20000
  })
  const tweets = Array.isArray(data?.tweets) ? data.tweets : []
  const cost = tweets.length ? (tweets.length * 0.15) / 1000 : 0.00015
  upsertUsage('x', { calls: 1, units: tweets.length, costUsd: cost })

  return tweets
    .filter((tweet) => tweet && tweet.id && tweet.text)
    .map((tweet) => {
      const author = tweet.author || {}
      const handle = author.userName || author.screenName || ''
      const tweetUrl = `https://x.com/${handle || 'i'}/status/${tweet.id}`
      return {
        externalId: `x:${tweet.id}`,
        title: truncate(tweet.text.replace(/\s+/g, ' '), 160),
        url: tweetUrl,
        excerpt: truncate(tweet.text, 300),
        publishedAt: parseDate(tweet.createdAt),
        author: author.name || handle,
        authorHandle: handle,
        authorFollowers: author.followers ?? null,
        authorVerified: Boolean(author.isBlueVerified || author.isVerified),
        authorCreatedAt: parseDate(author.createdAt),
        platform: 'x',
        domain: 'x.com',
        lang: tweet.lang || '',
        isFirstParty: isOfficialHandle(handle),
        metrics: {
          likes: tweet.likeCount,
          retweets: tweet.retweetCount,
          replies: tweet.replyCount,
          quotes: tweet.quoteCount,
          views: tweet.viewCount
        },
        raw: { id: tweet.id, handle }
      }
    })
}
