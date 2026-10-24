---
title: 架构决策记录（ADR）
status: draft
updated: 2026-10-24
---

# ADR-001 采用 Vue 2.7 作为前端框架

- **状态**：已接受（带风险）
- **背景**：需求方指定 Vue 2；团队熟悉度优先于长期维护。
- **决定**：锁定 `vue@2.7.16` + `vue-router@3.6.5`，使用 Options API；业务逻辑与视图分层（`api.js` / `store.js`）。
- **后果**：
  - Vue 2 已于 2023-12-31 EOL，不再有安全补丁；
  - 只在 `127.0.0.1` 运行，降低暴露面；
  - 未来迁移 Vue 3 时，后端与 core 不动，只改视图层。
- **备选**：Vue 3（被需求否决）。

# ADR-002 使用 Express 5.3

- **状态**：已接受
- **背景**：需求方指定 Node.js + Express；Express 5 已是 npm 最新主线。
- **决定**：`express@5.3.0`；路由按资源拆文件；SSE 直接用 `res.write` / `res.flushHeaders`。
- **后果**：
  - `app.get('*')` 不再可用，SPA fallback 改用中间件或 `/*splat`；
  - 错误处理必须是 4 参数中间件；
  - 静态资源 `fallthrough: true` 与 fallback 顺序需固定。
- **依据**：Context7 `/expressjs/express`、Express 5 迁移说明（2026-10-24 核对）。

# ADR-003 使用内置 node:sqlite

- **状态**：已接受
- **背景**：需要关系查询与唯一约束，但不想引入原生编译依赖。
- **决定**：Node 24 内置 `node:sqlite` 的 `DatabaseSync`；WAL + `busy_timeout=5000`。
- **后果**：
  - API 仍标注实验性，升级 Node 时需回归测试；
  - 单进程同步写入，写入串行化；
  - 若未来需要并发写，再评估 better-sqlite3 或 PostgreSQL。
- **依据**：nodejs.org/api/sqlite.html（2026-10-24）。

# ADR-004 本期不接入 AI，使用规则核验

- **状态**：已接受（临时）
- **背景**：OpenRouter API Key 暂缺；需求方明确「先跳过，不区分真伪」。
- **决定**：`VERIFY_MODE=rules`、`AI_ENABLED=false`；不预先创建 AI 表与目录，未来接入时新增 `analyses` 表与 `server/ai/` 并做一次迁移。
- **后果**：
  - 无法识别措辞巧妙的编造内容；只能靠一手源与多源印证；
  - UI 明确标注「规则核验」，避免误导；
  - 假新闻测试集已写好，启用 AI 后可直接回归。
- **依据**：03-verification.md。

# ADR-005 采集周期统一 30 分钟

- **状态**：已接受
- **背景**：需求方指定 30 分钟；兼顾时效与免费额度。
- **决定**：`SCAN_INTERVAL_SEC=1800` 作为默认；每个 Watch/Topic 可单独覆盖；提供「立即扫描」。
- **后果**：
  - 最坏延迟 30 分钟；
  - GitHub 未登录配额、Bing/HN 请求量均在安全范围；
  - X 若启用，约 $0.29/天（试用额度约 3–4 天）。

# ADR-006 X 适配器实现但默认关闭

- **状态**：已接受
- **背景**：需求方要求对接 X；但「全部免费」与 X 的付费现实冲突。
- **决定**：实现 `twitterapi.io` 适配器、成本统计与预算闸；`X_ENABLED=false`。
- **后果**：
  - 不填 key 时完全跳过，不影响其他源；
  - 有 $1 试用额度时可开启演示；
  - 长期使用需付费；README 明确说明。

# ADR-007 邮件先接 Ethereal

- **状态**：已接受
- **背景**：需求方希望「注册一个免费邮箱」，但注册需本人手机/验证码，且免费发信服务对收件人有限制。
- **决定**：`MAIL_TRANSPORT=ethereal`，用 `createTestAccount()` + `getTestMessageUrl()` 走完整 SMTP 流程并生成预览链接；`MAIL_TO` 预置 `anysong7@163.com`，后续切 163 SMTP 只改环境变量。
- **后果**：
  - 邮件不真实送达；
  - 可完整验收模板、重试、去重、状态机；
  - 若 Ethereal 不可达，自动降级 `streamTransport` 存 `.eml`。
- **依据**：nodemailer 10.2.1 源码（2026-10-24）。

# ADR-008 只使用免费数据源，不抓 HTML 搜索结果

- **状态**：已接受
- **背景**：需求方要求「全部免费」「不依赖单一源」。
- **决定**：
  - 启用 HN、Bing News RSS、官方 RSS、sitemap 爬虫、中文媒体 RSS、arXiv、GitHub Releases；
  - 不实现 Google News RSS（robots 禁止）、DDG HTML（实测验证码）、Bing/Google 搜索 HTML（robots 禁止）；
  - GDELT 默认关闭，待复测；
  - 可选替代：Tavily/Brave/Serper 免费额度（本期不接）。
- **后果**：覆盖面略窄于商业搜索 API，但零成本、稳定、合规。
- **依据**：02-data-sources.md、2026-10-24 实测。

# ADR-009 锁定 Vite 7.3.7，不升级 Vite 8

- **状态**：已接受
- **背景**：`@vitejs/plugin-vue2@2.3.4` 的 peer 为 `vite ^3||^4||^5||^6||^7`，npm 最新 Vite 为 8.3.5。
- **决定**：`vite@7.3.7` + `@vitejs/plugin-vue2@2.3.4`，精确锁版本。
- **后果**：
  - 无法使用 Vite 8 新特性；
  - plugin 仓库已归档（2026-05-19），不再修 bug；
  - 升级路径：迁移 Vue 3 + `@vitejs/plugin-vue`。

# ADR-010 单进程 + 进程内队列，不引入 Redis/消息队列

- **状态**：已接受
- **背景**：个人工具、单机部署、数据量小。
- **决定**：Express 进程内完成调度、采集、分析、通知；SQLite 持久化；串行写入队列。
- **后果**：
  - 部署只需 `node server/server.mjs`；
  - 进程崩溃会丢失内存中的进行中任务，但游标可续跑；
  - 未来多实例需改为外部队列（不在本期）。

# ADR-011 默认轮询，不用 Webhook

- **状态**：已接受
- **背景**：本机运行无公网入口；webhook 需要 HTTPS 回调。
- **决定**：所有源使用轮询 + 条件请求；X 的 WebSocket/filter rule 作为未来可选项。
- **后果**：延迟由 30 分钟周期决定；无公网依赖，安全简单。

# ADR-012 本地优先与密钥管理

- **状态**：已接受
- **决定**：
  - 默认 `HOST=127.0.0.1`；改为 `0.0.0.0` 必须设置 `ACCESS_TOKEN`；
  - 所有密钥只读 `.env`，API 返回掩码；
  - 不引入账号体系；局域网共享靠访问令牌。
- **后果**：单用户模型；多人使用需自行加反向代理与鉴权。
