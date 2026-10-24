---
title: API 与数据模型
status: draft
updated: 2026-10-24
---

# 1. 约定

- 基址：`http://127.0.0.1:8787/api`
- 请求/响应：`application/json; charset=utf-8`
- 时间：ISO 8601 UTC（前端转本地时区展示）
- 成功：HTTP 200/201 + 数据本体；失败：对应状态码 + `{ error: { code, message, detail? } }`
- 分页：`?limit=50&offset=0`，响应含 `{ items, total, limit, offset }`
- 所有写操作记录日志；不返回任何密钥（SMTP/API Key 一律掩码）

# 2. 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/status` | 版本、运行时长、调度下次执行、源健康、AI/X/邮件状态、今日用量 |
| GET | `/api/hotspots` | 热点事件流；参数 `topic, since, minCredibility, platform, q, limit, offset` |
| GET | `/api/events/:id` | 事件详情：items、来源、评分拆解、判定理由 |
| GET | `/api/watches` | 关键词列表（含 last_scan_at、命中数） |
| POST | `/api/watches` | 新建：`{ keyword, aliases?, excludeTerms?, minCredibility?, channels?, intervalSec? }` |
| PATCH | `/api/watches/:id` | 局部更新（含 enabled） |
| DELETE | `/api/watches/:id` | 删除 |
| GET | `/api/watches/:id/matches` | 该关键词命中的事件 |
| GET | `/api/topics` | 范围订阅列表 |
| POST | `/api/topics` | 新建/更新 Topic |
| PATCH | `/api/topics/:id` | 更新 |
| POST | `/api/scan` | `{ scope: "all" \| "watch:<id>" \| "topic:<id>", source?: "hn" \| ... }`，返回 `{ jobId }` |
| GET | `/api/scan/:jobId` | 任务进度（阶段、已处理、耗时、错误） |
| GET | `/api/alerts` | 告警列表；`unreadOnly`, `limit` |
| POST | `/api/alerts/:id/read` | 标记已读 |
| POST | `/api/alerts/read-all` | 全部已读 |
| GET | `/api/notifications` | 投递记录（含邮件预览 URL、失败原因） |
| GET | `/api/sources` | 源清单与健康 |
| PATCH | `/api/sources/:id` | 启停/改周期/改权重 |
| GET | `/api/usage` | 按天/按源的请求数与成本 |
| GET | `/api/settings` | 非敏感配置 + 密钥掩码 |
| PATCH | `/api/settings` | 更新可写配置（写 `.env` 之外的白名单项） |
| POST | `/api/test/email` | 发送一封测试邮件，返回 `{ previewUrl }` |
| POST | `/api/test/source` | 测试单个源（不发通知） |
| POST | `/api/feedback` | `{ itemId, verdict, note? }` |
| GET | `/api/stream` | SSE |

# 3. SSE 协议

**连接**

```
GET /api/stream
Accept: text/event-stream
Last-Event-ID: <可选，断线重连补发>
```

**响应头**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

**事件**

| event | data | 触发 |
|---|---|---|
| `hello` | `{ serverTime, unread }` | 连接建立 |
| `alert.new` | `{ id, eventId, title, summary, score, verdict, sources[], createdAt }` | 新告警 |
| `item.new` | `{ id, eventId, title, platform, domain }` | 新条目入库（可选订阅） |
| `scan.progress` | `{ jobId, phase, processed, total, errors }` | 扫描进度 |
| `source.health` | `{ source, health, lastError }` | 源状态变化 |
| `notification.update` | `{ id, channel, status, previewUrl? }` | 邮件投递状态 |
| `ping` | `{ t }` | 每 25s 心跳 |

**格式**

```
id: 1730000000123
event: alert.new
data: {"id":12,"eventId":8,"title":"...","score":0.82,"verdict":"verified"}

```

**重连与补发**

- 服务端保留最近 100 条事件（内存环形缓冲 + `alerts` 表兜底）；
- 客户端带 `Last-Event-ID` 重连时，补发该 ID 之后的缓冲事件；
- 超过缓冲范围则返回 `hello`，前端调用 `/api/alerts?unreadOnly=1` 补齐。

**实现注意**

- 禁用压缩；
- `res.flushHeaders()` 后立即写 `hello`；
- `req.on('close')` 从 hub 移除订阅并清心跳；
- 每个连接最大 10 分钟强制重连（前端自动），防止代理超时。

# 4. 错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | `INVALID_INPUT` | 参数缺失/格式错误 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 重复关键词 / 正在扫描 |
| 422 | `RULE_VIOLATION` | 关键词为空、间隔过短 |
| 429 | `RATE_LIMITED` | 测试接口频繁调用 |
| 500 | `INTERNAL` | 未捕获异常（记录 requestId） |
| 503 | `DEPENDENCY_DOWN` | 所有源不可用 / DB 不可写 |

响应示例：

```json
{ "error": { "code": "INVALID_INPUT", "message": "keyword 不能为空", "detail": { "field": "keyword" } } }
```

# 5. SQLite schema

开启 `journal_mode=WAL`、`busy_timeout=5000`、`foreign_keys=ON`。

```sql
CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- hn|rss|bing-news|gdelt|arxiv|github|sitemap|x
  name TEXT NOT NULL,
  url TEXT,
  weight REAL NOT NULL DEFAULT 0.5,
  enabled INTEGER NOT NULL DEFAULT 1,
  cursor TEXT,
  etag TEXT,
  last_modified TEXT,
  last_fetch_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  health TEXT NOT NULL DEFAULT 'ok',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_sources_kind_url ON sources(kind, IFNULL(url,''));

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  platform TEXT NOT NULL,          -- web|x
  external_id TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  author TEXT,
  author_handle TEXT,
  author_followers INTEGER,
  author_verified INTEGER NOT NULL DEFAULT 0,
  author_created_at TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  lang TEXT,
  is_first_party INTEGER NOT NULL DEFAULT 0,
  impersonation INTEGER NOT NULL DEFAULT 0,
  typosquat INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT,
  raw_json TEXT
);
CREATE UNIQUE INDEX ux_items_platform_external ON items(platform, external_id);
CREATE UNIQUE INDEX ux_items_url_hash ON items(url_hash);
CREATE INDEX ix_items_published ON items(published_at DESC);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  first_seen_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 1,
  source_count INTEGER NOT NULL DEFAULT 1,
  independent_domains INTEGER NOT NULL DEFAULT 1,
  source_trust REAL NOT NULL DEFAULT 0,
  corroboration REAL NOT NULL DEFAULT 0,
  rumor REAL NOT NULL DEFAULT 0,
  credibility REAL NOT NULL DEFAULT 0,
  heat REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX ix_events_last_updated ON events(last_updated_at DESC);

CREATE TABLE event_items (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, item_id)
);

CREATE TABLE watches (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  exclude_terms TEXT NOT NULL DEFAULT '[]',
  topic_id INTEGER REFERENCES topics(id),
  min_credibility REAL NOT NULL DEFAULT 0.65,
  interval_sec INTEGER NOT NULL DEFAULT 1800,
  channels TEXT NOT NULL DEFAULT '["inpage","email"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_scan_at TEXT
);
CREATE UNIQUE INDEX ux_watches_keyword ON watches(keyword);

CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  queries TEXT NOT NULL DEFAULT '[]',
  source_kinds TEXT,
  interval_sec INTEGER NOT NULL DEFAULT 1800,
  min_credibility REAL NOT NULL DEFAULT 0.65,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scan_at TEXT
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  watch_id INTEGER REFERENCES watches(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,              -- watch|topic
  score REAL NOT NULL,
  verdict TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE UNIQUE INDEX ux_alerts_event_watch ON alerts(event_id, IFNULL(watch_id,0));

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,           -- inpage|email
  status TEXT NOT NULL,            -- queued|sending|sent|failed|skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  preview_url TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
```

其余表：`feedback`、`source_usage`、`crawl_cache`、`robots_cache`、`settings`、`ai_usage`（字段见 `server/db/schema.sql`，与本文档一致）。

# 6. 通知状态机

```
inpage:  created → sent（推送到 SSE 即完成；无连接时保持 queued，重连补发）
email:   queued → sending → sent
                        └→ failed（3 次重试后）
         skipped（被合并窗口吸收 / 去重 / 超频 / 免打扰转入摘要）
```

去重键：`(event_id, channel, 日期)`；合并窗口 120s；高优先（firstParty 且独立域 ≥3）立即发送；频率上限 5 封/小时、20 封/天。

# 7. 配置项（`.env`）

```ini
# 基础
PORT=8787
HOST=127.0.0.1
ACCESS_TOKEN=
TZ=Asia/Shanghai
DB_PATH=./data/radar.db
LOG_LEVEL=info

# 采集
SCAN_INTERVAL_SEC=1800
GITHUB_TOKEN=
GITHUB_REPOS=openai/openai-python,langchain-ai/langchain,vllm-project/vllm,ollama/ollama,ggml-org/llama.cpp
RSS_FEEDS=
CRAWL_SITES=
CRAWL_MAX_PAGES=20
CRAWL_DELAY_MS=2000
GDELT_ENABLED=false
X_ENABLED=false
X_POLL_INTERVAL_SEC=1800
X_DAILY_BUDGET_USD=1.0
TWITTERAPI_KEY=
X_OFFICIAL_ACCOUNTS=OpenAI,AnthropicAI,GoogleDeepMind,huggingface,MetaAI,MistralAI,deepseek_ai,Alibaba_Qwen

# 核验
VERIFY_MODE=rules
AI_ENABLED=false
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash
PUSH_MIN_CREDIBILITY=0.65
PUSH_MIN_DOMAINS=2
ALERT_MAX_PER_WATCH_PER_HOUR=5
ALERT_MAX_PER_WATCH_PER_DAY=30

# 页面通知
INPAGE_ENABLED=true
INPAGE_TOAST_MS=4800
INPAGE_MODAL_MIN_SCORE=0.88
INPAGE_SOUND=false

# 邮件
MAIL_ENABLED=true
MAIL_TRANSPORT=ethereal          # ethereal | smtp
MAIL_TO=anysong7@163.com
MAIL_FROM="SIGNAL Radar <radar@localhost>"
MAIL_MERGE_WINDOW_SEC=120
MAIL_MAX_PER_HOUR=5
MAIL_MAX_PER_DAY=20
MAIL_QUIET_HOURS=
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
```

> SMTP 凭据只从环境变量读取；`/api/settings` 返回时统一替换为 `"******"`。

