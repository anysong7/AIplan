---
title: 测试与验收
status: draft
updated: 2026-10-24
---

# 1. 策略

- **纯函数优先**：归一化、去重、评分、门控、查询构造全部无副作用，便于表驱动测试。
- **不依赖外网**：单元与集成测试使用 `tests/fixtures/` 中的真实样本；邮件用 `MAIL_TRANSPORT=stream` 捕获 MIME，不触达真实 SMTP。
- **测试命令**：`npm test`（`node --test tests/unit/*.test.mjs tests/integration/*.test.mjs`），CI 友好，无额外框架。
- **手工验收**：涉及视觉、响应式、邮件模板、真实第三方接口的部分，按 §5 清单执行。

# 2. 目录

```
tests/
├─ unit/
│  ├─ normalize.test.mjs
│  ├─ keywords.test.mjs
│  ├─ dedupe.test.mjs
│  ├─ cluster.test.mjs
│  ├─ trust.test.mjs
│  ├─ scoring.test.mjs
│  ├─ gate.test.mjs
│  ├─ query-builder.test.mjs      # X 查询 / Bing / HN
│  ├─ bing-link.test.mjs
│  ├─ xml-parser.test.mjs
│  ├─ scheduler.test.mjs
│  ├─ mail-template.test.mjs
│  └─ robots.test.mjs
├─ integration/
│  ├─ pipeline.test.mjs
│  ├─ api.test.mjs
│  ├─ sse.test.mjs
│  ├─ notify.test.mjs
│  └─ x-adapter.test.mjs
└─ fixtures/
   ├─ bing-news.xml
   ├─ atom-arxiv.xml
   ├─ hn-search.json
   ├─ tweets.json
   ├─ sitemap.xml
   ├─ article.html
   ├─ robots-allow.txt
   ├─ robots-deny.txt
   └─ openrouter-verdict.json      # 未来 AI 用例，当前未使用
```

# 3. 单元测试要点

| 模块 | 用例 |
|---|---|
| normalize | 全角/半角、大小写、零宽字符、空白折叠、URL 去 utm、t.co 展开 |
| keywords | 英文词边界（`said` 不命中 `ai`）、中文子串、别名、排除词、空关键词报错 |
| dedupe | 同 `external_id`、同 canonical URL、不同 utm、标题 Jaccard 阈值边界（0.81/0.82/0.83） |
| cluster | 相似标题合并、跨日不合并、event_key 稳定性、同事件重算不重复 |
| trust | 白名单命中、未知域、X 官方/蓝标/普通、仿冒域名降权 |
| scoring | 四组输入 → 期望 credibility；边界 0.649/0.650/0.651 |
| gate | 门控真值表（firstParty × 独立域 × rumor × impersonation） |
| query-builder | 关键词转义、OR 合并、`since:` 日期、长度上限 255（X filter rule） |
| bing-link | `apiclick.aspx?...&url=` 解码、异常参数回退 |
| xml-parser | RSS 2.0 / Atom / CDATA / 缺失字段 / 非法 XML |
| scheduler | due 计算、退避序列、冷却期、重启后补跑 |
| mail-template | 主题格式、纯文本降级、无外部资源、XSS 转义 |
| robots | Allow 优先、最长匹配、Crawl-delay、Sitemap 提取 |

# 4. 集成测试

用本地 `node:http` 起 mock 服务，覆盖：

1. **pipeline**：mock RSS + mock HN → 归一化 → 去重 → 聚类 → 评分 → 生成 alert；
2. **api**：`POST /api/watches` → `POST /api/scan` → `GET /api/hotspots` 返回预期；
3. **sse**：连接 `/api/stream`，触发扫描，断言收到 `hello`、`scan.progress`、`alert.new`，顺序正确；
4. **notify**：mock 事件 → `notifications` 生成 inpage 与 email 两条；120s 合并窗口内多条只发一封（用假时钟推进）；重复事件不重发；
5. **x-adapter**：mock `advanced_search` 响应 → 字段映射、去重、官方账号权重、429 退避、预算耗尽跳过；
6. **email**：`streamTransport` 捕获 MIME，断言主题、收件人、HTML/plain 两份、链接正确。

> 假时钟：`scheduler` 与 `mail queue` 接受注入的 `now()`，测试中手动推进，不 `sleep`。

# 5. 手工验收清单

## P0 骨架
- [ ] `npm run dev` 打开 5173，页面无报错，样式 token 生效
- [ ] `npm run build && npm start` 后 8787 可访问，刷新子路由不 404
- [ ] `/api/status` 返回版本、源清单、邮件状态

## P1 采集
- [ ] 点击"立即扫描"，HN/RSS/arXiv/GitHub 均有新增
- [ ] 同一批数据重复扫描，`items` 不增加
- [ ] Bing News 关键词能返回结果，链接指向原文
- [ ] sitemap 爬虫日志显示 robots 判定、请求间隔、抓取篇数
- [ ] 关掉网络后扫描：状态为 degraded，UI 有提示，服务不崩

## P2 核验
- [ ] 注入假新闻用例 1/5/6/7：均不推送，观察区可见
- [ ] 用例 2/3：推送，事件详情显示独立域数与评分拆解
- [ ] 用例 8：3 个媒体转载只算 2 个独立域
- [ ] 修改 `PUSH_MIN_CREDIBILITY` 后行为随之变化

## P3 通知
- [ ] 真实事件：页面 1s 内 Toast，邮件 2 分钟内 `sent`
- [ ] 邮件预览链接可打开，模板正确，移动端可读
- [ ] 同一事件 24h 只弹一次、只发一封
- [ ] 关闭页面后触发：邮件照发，重开页面可补看未读
- [ ] 故意断网 SMTP：3 次重试后 `failed`，UI 显示原因
- [ ] `MAIL_TRANSPORT=stream` 时生成 `.eml`，不报错

## P4 界面
- [ ] 375 / 768 / 1024 / 1440 无横向滚动
- [ ] 键盘完成：`/` 搜索 → `j/k` 选择 → `Enter` 打开 → `Esc` 关闭
- [ ] 焦点环可见，Tab 顺序合理
- [ ] 开启"减少动态效果"后无扫描旋转与脉冲
- [ ] 颜色对比度抽查（标题/正文/元数据/按钮）
- [ ] Toast 不遮挡移动端底部导航

## P5 收口
- [ ] `npm test` 全绿，覆盖率报告可读（可选 `--experimental-test-coverage`）
- [ ] 按 README 从零（删 `data/` 与 `node_modules/`）跑通
- [ ] `git status` 无敏感文件（`.env`、`radar.db` 已忽略）

## P6 Skill
- [ ] `radar.mjs --help` 输出完整命令
- [ ] 另一个 AI 会话完成：加关键词 → 扫描 → 汇总 3 条热点
- [ ] 服务未启动时 `--standalone` 能独立扫描
- [ ] 输出 JSON 通过 schema 校验

# 6. 非功能抽检

| 项 | 方法 | 阈值 |
|---|---|---|
| 首屏 | Lighthouse（本地） | LCP < 1.5s |
| API | `curl -w` 10 次取均值 | `/api/hotspots` < 300ms |
| SSE | DevTools 观察心跳 | 25s ± 2s |
| 内存 | 连续扫描 6 轮 | 增长 < 80MB |
| DB | 1000 条插入 | < 1s（WAL） |

# 7. 缺陷分级

| 级别 | 定义 | 处理 |
|---|---|---|
| P0 | 数据丢失、误推假消息、服务无法启动 | 立即修复，阻断发布 |
| P1 | 漏推、邮件不发、页面崩溃 | 当轮修复 |
| P2 | 样式错位、文案问题、非关键接口失败 | 记录，迭代修 |
| P3 | 体验优化、可选功能 | 进 backlog |
