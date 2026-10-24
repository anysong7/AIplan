import { config } from '../config.mjs'
import { fetchJson } from './http.mjs'

export async function collectGithub(source) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`

  const items = []
  for (const repo of config.githubRepos) {
    try {
      const { data } = await fetchJson(
        `https://api.github.com/repos/${repo}/releases?per_page=10`,
        { headers, minGapMs: 1200 }
      )
      if (!Array.isArray(data)) continue
      for (const release of data) {
        if (!release || release.draft) continue
        items.push({
          externalId: `gh:${repo}:${release.tag_name || release.id}`,
          title: `${repo} ${release.tag_name || ''} 发布`.trim(),
          url: release.html_url,
          excerpt: (release.body || '').slice(0, 300),
          publishedAt: release.published_at || release.created_at,
          author: release.author?.login || '',
          platform: 'web',
          domain: 'github.com',
          isFirstParty: true,
          metrics: {},
          raw: { repo, tag: release.tag_name }
        })
      }
    } catch {
      // 单个仓库失败不影响其他仓库
    }
  }
  return items
}
