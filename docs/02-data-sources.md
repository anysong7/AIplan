---
title: 数据源与采集实现
status: draft
updated: 2026-10-24
---

# 1. 原则

1. **多源覆盖**：一手发布、社交、新闻聚合、技术社区、论文五类并行，任何单一来源失效都不影响产品可用。
2. **全部免费**：本期只启用无 key、无付费的源；X 保留适配器但默认关闭（仅 $1 试用额度）。
3. **合规优先**：遵守 robots.txt；不使用搜索引擎 HTML 结果页；Google News RSS 因 robots 未允许而关闭。
4. **轻量存储**：只存标题、短摘要（≤300 字）、链接、时间、作者、公开互动数；不抓正文。

# 2. 源矩阵（默认配置）

| key | 类型 | 接入 | 认证 | 周期 | 权重 | 默认 |
|---|---|---|---|---|---|---|
| `hn` | 社区 | `hn.algolia.com/api/v1/search_by_date` | 无 | 30 min | 0.65 | 开 |
| `bing-news` | 新闻聚合 | `bing.com/news/search?format=rss` | 无 | 30 min | 0.45–0.72（按原文域名） | 开 |
| `rss-official` | 一手发布 | 官方博客 RSS | 无 | 30 min | 1.00 | 开 |
| `rss-media` | 媒体 | TechCrunch / The Verge / 量子位 / InfoQ 等 | 无 | 30 min | 0.72 | 开 |
| `sitemap` | 一手发布 | 站点 `sitemap.xml` + 文章页 meta | 无 | 30 min | 0.72（白名单）/0.40 | 开 |
| `github-releases` | 一手发布 | `api.github.com/repos/{o}/{r}/releases` | 可选 token | 30 min | 0.90 | 开 |
| `arxiv` | 论文 | `export.arxiv.org/api/query` | 无 | 30 min | 0.85 | 开（折叠） |
| `gdelt` | 新闻聚合 | `api.gdeltproject.org/api/v2/doc/doc` | 无 | 30 min | 0.60 | **暂关**（待复测） |
| `x` | 社交 | `api.twitterapi.io/twitter/tweet/advanced_search` | `X-API-Key` | 30 min | 0.35–0.95 | **关** |

**已明确不使用**

| 源 | 原因 |
|---|---|
| Google News RSS | `news.google.com/robots.txt` 为 `Disallow: /`，`/rss` 不在 Allow 列表 |
| DuckDuckGo HTML | 实测返回人机验证 |
| Bing / Google HTML 搜索结果页 | robots 禁止 `/search`；且极易触发验证 |
| X 官方 API v2 | 读接口 Basic 档约 $200/月，超出「免费」约束 |
| Reddit / 微信公众号 / 小红书 | 无稳定免费接口或合规风险高 |

# 3. 通用采集框架

`server/collectors/http.mjs` 提供统一出口，所有适配器不得直接 `fetch`。

```js
// 伪代码
request(url, {
  timeoutMs: 10000,
  headers: { 'User-Agent': UA, 'If-None-Match': etag, 'If-Modified-Since': lastModified },
  maxBytes: 2_000_000,
  retries: 2,
  backoff: [1000, 3000]
})
```

规则：

| 项 | 值 |
|---|---|
| UA | `SIGNAL-Radar/0.1 (+local personal monitoring; contact=<MAIL_TO>)` |
| 超时 | 10s（RSS/HN）、20s（sitemap 文章页） |
| 并发 | 全局 4；同一 host 串行 |
| 同 host 间隔 | ≥2s（sitemap）、≥1s（API） |
| 条件请求 | RSS/sitemap 用 `ETag` + `Last-Modified`；304 不计入失败 |
| 重试 | 429/5xx 重试 2 次，指数退避；403 不重试 |
| 冷却 | 429 读 `Retry-After`；否则 30min；连续 3 次失败 `health=degraded` |
| 响应大小 | 超过 2MB 截断并记录警告 |
| 编码 | 先按 `content-type`，再嗅探 `<meta charset>`；统一转 UTF-8 |

**每个源在 `sources` 表中的状态字段**：`cursor / etag / last_modified / last_fetch_at / fail_count / cooldown_until / health`。

**用量记账**：每次请求写 `source_usage(source, day, calls, units, cost_usd)`，用于状态页与 X 预算控制。

# 4. 各源实现细节

## 4.1 Hacker News（`hn`）

```
GET https://hn.algolia.com/api/v1/search_by_date
    ?query=<encoded>&tags=story&hitsPerPage=50
    &numericFilters=created_at_i><lastCursorEpoch>
```

- 无 key；按 `created_at_i` 增量拉取；`cursor` 存最新 `created_at_i`。
- 字段映射：`objectID → external_id`，`title`，`url`（为空则用 `https://news.ycombinator.com/item?id=<id>`），`created_at`，`author`，`points`，`num_comments`。
- `metrics_json = {points, comments}`；`heat` 用 `log10(points+1)` 计入排序。
- 关键词监控时 `query` 用关键词；热点 Topic 用 Topic 的查询词；两者共用同一适配器。
- 权重 0.65；不作为一手源。

## 4.2 Bing News RSS（`bing-news`）

```
GET https://www.bing.com/news/search?q=<encoded>&format=rss&setlang=zh-cn&cc=cn&mkt=zh-CN
```

- 返回 RSS 2.0；`item` 字段：`title`、`link`、`description`、`pubDate`、`News:Source`。
- `link` 形如 `http://www.bing.com/news/apiclick.aspx?...&url=<encodedOriginal>`：**解析 `url` 查询参数得到原文地址**；解析失败则保留 Bing 链接并标记 `domain=bing.com`。
- `external_id` 用原文 URL 的 sha1；`published_at` 用 `pubDate`（RFC 822）。
- `description` 去 HTML 后截 300 字作为摘要。
- 原文域名权重：白名单/精选媒体 0.72，未知 0.45。
- 合规：Bing RSS 版权声明限「个人、非商业、RSS 阅读器内呈现」；本项目只存标题+短摘要+链接，不转载全文。

## 4.3 官方 / 媒体 RSS（`rss`）

- 支持 RSS 2.0 与 Atom；解析用 `fast-xml-parser`，统一映射：
- 每个 feed 每轮最多取最新 40 条，防止历史归档一次性灌入。

| 统一字段 | RSS | Atom |
|---|---|---|
| title | `item.title` | `entry.title` |
| link | `item.link` | `entry.link[@rel=alternate].@href` |
| id | `item.guid` | `entry.id` |
| published | `item.pubDate` | `entry.published` / `updated` |
| summary | `item.description` | `entry.summary` / `content` |

- `cursor` 存上次最新条目时间；同一 feed 内按 `guid` 去重。
- 官方域名（白名单）标记 `is_first_party=1`，权重 1.0。
- 中文源：机器之心、量子位、InfoQ 中文、36氪（具体 feed 在 P1 逐个 smoke test，失败则禁用并记录）。

## 4.4 sitemap 爬虫（`sitemap`）

适用：无 RSS 的官方博客/媒体页面。

```
1. GET https://<host>/robots.txt        （缓存 24h，解析 Sitemap: 与 Disallow）
2. GET sitemap.xml / sitemap_index.xml  （含 news sitemap）
3. 解析 <url><loc><lastmod>；只取 lastmod > cursor 的条目
4. 每轮每站最多 20 篇，同 host 间隔 ≥2s
5. GET 文章页，提取：
   - og:title / og:description
   - article:published_time 或 JSON-LD datePublished
   - <link rel="canonical">
6. 只入库标题 + 摘要（≤300 字）+ 时间 + 链接
```

- robots 判定用 `robots-parser` 的 `isAllowed(url, UA)`；被禁则整站跳过并记录原因。
- `cursor` 存该站已处理的最大 `lastmod`（ISO 字符串）。
- 失败页面不重试超过 2 次；连续 5 个页面失败则本轮中止。
- 白名单域名标 `is_first_party=1`；未知站点权重 0.40，且不参与「一手源」判定。
- 不做：站内搜索、分页遍历、正文抽取、图片下载。

## 4.5 GitHub Releases（`github-releases`）

```
GET https://api.github.com/repos/{owner}/{repo}/releases?per_page=10
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
If-None-Match: <etag>
```

- 未登录 60 次/小时；304 不计入配额；建议配 `GITHUB_TOKEN`（可选，升至 5000/h）。
- 默认仓库（可在设置页增删）：
  `openai/openai-python`、`langchain-ai/langchain`、`vllm-project/vllm`、`ollama/ollama`、`ggml-org/llama.cpp`、`modelcontextprotocol/servers`、`huggingface/transformers`、`microsoft/autogen`、`crewAIInc/crewAI`、`Aider-AI/aider`
- 字段：`tag_name → title` 前缀，`body` 截 300 字，`published_at`，`html_url`，`author.login`。
- 权重 0.90；`is_first_party=1`（官方仓库）。
- 同一 release 的 `external_id = repo + tag_name`。

## 4.6 arXiv（`arxiv`）

```
GET http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG
    &sortBy=submittedDate&sortOrder=descending&max_results=50
```

- 建议请求间隔 ≥3s；本项目 30 分钟一次，安全。
- 解析 Atom：`entry.id / title / summary / published / author.name / link[@title=pdf]`。
- 权重 0.85；默认在 UI 折叠，可筛选。
- `external_id = arXiv id`（如 `2501.01234`）。

## 4.7 GDELT（`gdelt`，默认关闭）

```
GET https://api.gdeltproject.org/api/v2/doc/doc
    ?query=<encoded>&mode=ArtList&format=json&timespan=30min&maxrecords=50&sort=DateDesc
```

- 无 key；响应 `articles[]`：`url / title / seendate / domain / language / sourcecountry`。
- 用于多源印证与英文/多语种补盲；权重 0.60。
- **本次实测请求失败**（网络/接口原因未定），因此默认关闭；P1 增加 smoke test，连续 3 次失败则保持禁用。
- 请求间隔 ≥5s。

## 4.8 X / Twitter（`x`，默认关闭）

**鉴权与端点**

```
GET https://api.twitterapi.io/twitter/tweet/advanced_search
    ?query=<X 搜索语法>&queryType=Latest&cursor=
X-API-Key: <TWITTERAPI_KEY>
```

**查询构造（合并请求，控制成本）**

```
Q1 内容: (OpenAI OR "GPT-5" OR Anthropic OR Claude OR "AI 编程") -filter:retweets -filter:replies since:<YYYY-MM-DD>
Q2 官方: (from:OpenAI OR from:AnthropicAI OR from:GoogleDeepMind OR from:huggingface) -filter:retweets
```

- 每条查询只取第一页（20 条），不自动翻页；`since:` 取上次成功时间的前一天。
- 本地按关键词/别名归属到具体 Watch；`external_id = tweet.id`。
- 字段：`text`、`createdAt`、`author.userName`、`author.followers`、`author.isBlueVerified`、`author.createdAt`、`likeCount`、`retweetCount`、`replyCount`、`quoteCount`、`viewCount`、`entities.urls`。
- 权重：官方账号 0.95（`is_first_party=1`）、蓝标老号 0.70、普通号 0.35。
- 高仿检测：handle 与官方 handle 编辑距离 ≤2 且不完全相等 → `impersonation=1`，直接不推送。

**成本与限流**

| 项 | 数值 |
|---|---|
| 计费 | $0.15 / 1,000 条；空结果 $0.00015/次 |
| 限流 | 新号 1 req/5s；充值后 20 req/s；超限 429 |
| 默认轮询 | 30 min × 2 条查询 = 96 次/天 |
| 最坏成本 | 96 × 20 × $0.15/1000 ≈ **$0.29/天**（命中少时更低） |
| 预算闸 | `X_DAILY_BUDGET_USD=1.0`，超限当日停用并在 UI 提示 |
| 试用额度 | $1 ≈ 6,600 条推文 |

**可选近实时**：`POST /oapi/tweet_filter/add_rule`（`tag`、`value` ≤255 字符、`interval_seconds` 0.05–86400），再 `update_rule` 激活，通过 Webhook/WebSocket 接收。需 Pro 订阅（约 $29/月），本期不启用。

# 5. 去重与游标

| 层级 | 键 | 说明 |
|---|---|---|
| 精确 | `(platform, external_id)` 唯一 | 推文 id、HN objectID、GitHub repo+tag、arXiv id、RSS guid |
| URL | `url_hash = sha1(canonical_url)` 唯一 | 去 utm/fragment、展开 t.co、统一小写 host、去尾斜杠 |
| 近似 | 标题 trigram Jaccard ≥ 0.82 | 同事件转载合并；24h 窗口内比较 |
| 事件 | `event_key` | 归一化标题关键词 + UTC 日期桶的 sha1；相似标题合并到已有事件 |

游标：每个 source 存 `cursor`（时间戳或最后 ID），重启后从游标续跑；同一轮内先写 `items`，再写 `events`，最后生成 `alerts`。

# 6. 合规与频率

- 遵守 robots.txt；被禁止的路径不请求；
- 只使用公开 RSS/API，不绕过登录、付费墙、验证码；
- 不抓取搜索引擎结果页；
- Bing News RSS 仅个人非商业使用；README 中声明；
- 全局 30 分钟一轮，单 host 请求间隔 ≥1–2s，夜间（可选）可降频。

# 7. 健康与用量

```
sources.health: ok | degraded | disabled | unconfigured
source_usage: (source, day) → calls / units / cost_usd
```

状态页展示：最后成功时间、失败次数、下次计划时间、今日请求量、X 今日花费/预算、邮件最近投递状态。

