---
title: 架构与技术选型
status: draft
updated: 2026-10-24
---

# 1. 架构总览

```
┌──────────────────────────── 浏览器 ────────────────────────────┐
│ Vue 2.7 SPA（热点 / 监控 / 设置）   SSE EventSource   Toast/Modal │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTP /api/*        │ text/event-stream
┌───────────────▼────────────────────▼────────────────────────────┐
│ Node.js 24 单进程                                                │
│  Express 5.3                                                     │
│   ├─ routes/  (status, hotspots, events, watches, scan, alerts,  │
│   │            sources, notifications, settings, stream)         │
│   ├─ Scheduler  30min tick + 手动触发（串行队列）                │
│   ├─ Collectors hn | rss | bing-news | gdelt | arxiv | github |  │
│   │            sitemap | x(off)                                   │
│   ├─ Pipeline   normalize → prefilter → dedupe → cluster →       │
│   │            score/gate → alert → notify                        │
│   ├─ Notifier   SSE hub | mail queue（Ethereal / SMTP）          │
│   └─ SQLite     node:sqlite → data/radar.db                      │
└───────────────┬──────────────────────────────────────────────────┘
                │ 同一套 core 模块（本机文件）
┌───────────────▼──────────────────────────────────────────────────┐
│ Agent Skill：.claude/skills/hotspot-radar/{SKILL.md, scripts/}    │
│  优先走 HTTP API；服务未启动时 --standalone 直接调用 core         │
└──────────────────────────────────────────────────────────────────┘
```

**核心原则**

1. 单进程、单文件数据库、无消息队列、无 Redis；
2. 采集与分析解耦：采集只入库，分析只读库，失败可重放；
3. 通知可降级：SSE 挂了邮件仍在，邮件挂了页面仍可用；
4. 规则可测试：所有判定为纯函数，输入 Item/Event，输出分数与理由。

# 2. 运行时模型

| 阶段 | 行为 |
|---|---|
| 启动 | 加载 `.env` → 打开/迁移 SQLite → 注册路由 → 启动 SSE hub → 启动调度器 → `listen(8787, 127.0.0.1)` |
| 周期 | 每 30s 检查一次是否有到期的 source/watch/topic；到期的加入串行队列 |
| 扫描 | 采集并发 4（单域 1）→ 归一化 → 预筛 → 去重入库 → 聚类 → 评分 → 生成 alert → 通知 |
| 关闭 | `SIGINT/SIGTERM`：停止调度 → 等待在途任务（≤5s）→ 关闭 DB → 退出 |
| 重启 | 依据 `sources.cursor`、`settings.last_scan_at` 续跑，不重复推送已读事件 |

# 3. 目录结构（最终形态）

```
AIplan/
├─ package.json                  # type: module；脚本见 §7
├─ vite.config.mjs               # root=client；/api 代理到 8787
├─ .env.example  .gitignore  README.md
├─ scripts/dev.mjs               # 并行启动 server 与 vite（零额外依赖）
├─ data/                         # radar.db、mail-preview/（git 忽略）
├─ docs/                         # 本套文档
├─ server/
│  ├─ server.mjs                 # 启动、调度、优雅退出
│  ├─ app.mjs                    # Express 装配、静态托管、SPA fallback、错误处理
│  ├─ config.mjs                 # 环境变量解析与默认值
│  ├─ db/{index.mjs, schema.sql, migrate.mjs}
│  ├─ routes/*.mjs
│  ├─ collectors/{hn,rss,bing-news,gdelt,arxiv,github,sitemap,x,xml,http}.mjs
│  ├─ core/{normalize,dedupe,cluster,trust,scoring,gate,keywords,pipeline}.mjs
│  ├─ scheduler/{scheduler,queue}.mjs
│  ├─ notify/{hub,dispatcher,mail,email-template,inpage,queue}.mjs
│  ├─ http/{sse,errors,validate}.mjs
│  └─ cli/radar.mjs
├─ client/
│  ├─ index.html
│  └─ src/{main.js, router.js, store.js, api.js}
│     ├─ styles/{tokens.css, base.css, layout.css}
│     ├─ components/{AppShell,ScanBar,RadarDial,HotspotCard,CredibilityRing,
│     │               SignalBar,EvidenceChain,DetailDrawer,ToastStack,AlertModal,
│     │               SourceHealth,Icon,EmptyState}.vue
│     └─ views/{FeedView,WatchView,SettingsView}.vue
├─ tests/{unit/, integration/, fixtures/}
└─ .claude/skills/hotspot-radar/{SKILL.md, scripts/radar.mjs, references/output-schema.md}
```

# 4. 技术选型与版本锁定

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| 运行时 | Node.js | ≥24.0（开发机 24.22.0） | `node:sqlite`、`fetch`、`node --watch`、`node --test` |
| Web 框架 | Express | **5.3.0** | 唯一运行时框架 |
| 数据库 | `node:sqlite` | Node 内置 | `DatabaseSync`，无原生编译依赖（仍标注实验性） |
| 前端框架 | Vue | **2.7.16** | 用户指定；EOL 风险见 ADR-001 |
| 路由 | vue-router | **3.6.5** | Vue 2 对应版本 |
| 构建 | Vite | **7.3.7** | ⚠️ 不能用 8.x：plugin-vue2 peer 上限为 `^7.0.0` |
| Vue SFC | @vitejs/plugin-vue2 | **2.3.4** | 仅支持 `vue ^2.7.0`；仓库已归档，锁死不升级 |
| XML | fast-xml-parser | **5.11.2** | RSS/Atom/sitemap，双 ESM/CJS 导出 |
| HTML | cheerio | **1.2.0** | sitemap 文章页 `og:*` / JSON-LD 提取；Node ≥20.18.1 |
| robots | robots-parser | **3.0.1** | `isAllowed` / `getCrawlDelay` |
| 邮件 | nodemailer | **10.2.1** | 原生 ESM；`createTestAccount` / `getTestMessageUrl` |
| 测试 | `node --test` | 内置 | 无 Jest/Vitest |

**依赖清单**：`dependencies` = express, nodemailer, fast-xml-parser, cheerio, robots-parser, vue, vue-router；`devDependencies` = vite, @vitejs/plugin-vue2。共 9 个包。

# 5. 关键实现约束（来自最新官方文档，勿改动）

| 约束 | 正确写法 | 错误写法 |
|---|---|---|
| Express 5 通配符 | `app.use((req,res,next)=>{...})` 或 `app.all('/*splat', ...)` | `app.get('*', ...)` |
| SSE | `res.writeHead(200, {...}); res.flushHeaders(); res.write('event: x\ndata: {...}\n\n')` | 用 `res.send()` / 压缩中间件 |
| SPA fallback | `express.static(dist, {fallthrough:true})` 之后挂普通中间件 | 把静态放在 fallback 之后 |
| 错误处理 | 4 参数中间件，放在所有路由之后 | 3 参数 |
| `node:sqlite` | `new DatabaseSync(path)`；`db.prepare(sql).run/get/all` | 引入 better-sqlite3 |
| Ethereal | `createTestAccount()` → `{user,pass,smtp:{host,port,secure},web}`；`getTestMessageUrl(info)` | 自己拼预览 URL |
| X 搜索 | `GET https://api.twitterapi.io/twitter/tweet/advanced_search?query=...&queryType=Latest&cursor=`，头 `X-API-Key` | 用官方 X API v2（付费 $200/月） |
| Bing News | `https://www.bing.com/news/search?q=<q>&format=rss`，链接取 `url=` 参数 | 抓 `/search` HTML（robots 禁止） |

# 6. 降级与错误处理

| 故障 | 行为 |
|---|---|
| 某源 4xx/5xx | 指数退避 1→2→5→15→60min；连续 3 次 `health=degraded`；UI 红点 |
| 429 | 读 `Retry-After`，至少冷却 30min，不重试轰炸 |
| XML 解析失败 | 丢弃该次响应、记录样本前 500 字符、不阻塞其他源 |
| X 未配置/额度耗尽 | 跳过 X，状态页显示原因；其他源继续 |
| GDELT 不可达 | 标记可选源失败，不影响主流程 |
| 邮件失败 | 3 次重试（30s/2min/10min）→ `failed`；页面显示原因；不影响 SSE |
| Ethereal 账号失效 | 自动重建账号并重发一次 |
| DB 锁 | WAL 模式 + `busy_timeout=5000`；写入串行化 |

# 7. 脚本与运行

```json
{
  "dev": "node scripts/dev.mjs",
  "dev:server": "node --watch server/server.mjs",
  "dev:client": "vite",
  "build": "vite build",
  "start": "NODE_ENV=production node server/server.mjs",
  "test": "node --test tests/unit/*.test.mjs tests/integration/*.test.mjs",
  "scan": "node server/cli/radar.mjs scan"
}
```

- 开发：`npm run dev` → API `127.0.0.1:8787`，前端 `127.0.0.1:5173`（`/api` 代理；SSE 走代理若被缓冲，则 `api.js` 回退直连 `VITE_API_BASE`）
- 生产：`npm run build && npm start` → 单端口 `127.0.0.1:8787`，同源无 CORS

# 8. 版本校验记录（2026-10-24）

| 校验项 | 命令 / 来源 | 结果 |
|---|---|---|
| Express 最新 | `npm view express version` | 5.3.0 |
| Vite 最新 | `npm view vite version` | 8.3.5；**本项目锁 7.3.7** |
| plugin-vue2 peer | `npm view @vitejs/plugin-vue2 peerDependencies` | `vite ^3\|\|^4\|\|^5\|\|^6\|\|^7`，`vue ^2.7.0-0` |
| plugin-vue2 状态 | GitHub vitejs/vite-plugin-vue2 | 2026-05-19 归档，仅支持 Vue 2.7 |
| Vue 2 最终版 | `npm view vue@2 version` | 2.7.16 |
| Nodemailer | `npm view nodemailer version` + unpkg 源码 | 10.2.1，确认导出 `createTestAccount/getTestMessageUrl` |
| cheerio 引擎 | `npm view cheerio@1.2.0 engines` | `node >=20.18.1` |
| Node SQLite | nodejs.org/api/sqlite.html | `DatabaseSync` 可用；实验性但无需 flag |
| Express 5 路由 | Context7 `/expressjs/express` | 命名通配 `/*splat`；SSE 可直写；static fallthrough |
| Bing News RSS | 实际请求 | 200，标准 RSS |
| DuckDuckGo HTML | 实际请求 | 返回人机验证 → 不实现 |
| Google News robots | news.google.com/robots.txt | `Disallow: /`，`/rss` 未允许 → 默认关闭 |
| twitterapi.io | 官方 docs + OpenAPI | 鉴权/限流/计费见 02 文档 |
| GDELT | 官方文档 + 实测 | 本次请求失败 → 默认关闭，P1 复测 |

