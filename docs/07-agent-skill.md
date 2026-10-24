---
title: Agent Skill 设计
status: draft
updated: 2026-10-24
---

# 1. 目标

把「监控关键词 + 汇总热点」封装成其他 AI 可直接使用的技能：

- 触发词明确，AI 知道何时该调用；
- 命令幂等、输出稳定，便于 AI 解析；
- 服务在跑时走 HTTP API，未启动时可独立扫描（共享 SQLite 与 core）；
- 不复制业务逻辑，`scripts/radar.mjs` 只做参数解析与输出格式化。

# 2. 目录

```
.claude/skills/hotspot-radar/
├─ SKILL.md
├─ scripts/
│  ├─ radar.mjs              # 入口（可执行）
│  └─ lib/
│     ├─ client.mjs          # HTTP 客户端（超时/重试/错误映射）
│     ├─ standalone.mjs      # 无服务时直接调用 core
│     └─ format.mjs          # table / json 输出
├─ references/
│  ├─ output-schema.md
│  └─ troubleshooting.md
└─ README.md                 # 安装到 ~/.claude/skills 的说明
```

# 3. SKILL.md 规范

```markdown
---
name: hotspot-radar
description: 监控 AI 热点与关键词。当用户想追踪大模型更新、AI 编程热点、设置关键词告警、查看可信热点或生成每日简报时使用。
---

# 使用场景
- "帮我盯着 GPT-5 的发布" → watch add + scan
- "今天 AI 编程有什么热点" → hotspots --since 24h
- "把过去 24 小时的热点整理成简报" → brief --md

# 前置条件
- 本地服务默认 http://127.0.0.1:8787；未启动时自动 --standalone
- 环境变量 RADAR_API（可选）、RADAR_DB（可选）

# 命令
...

# 输出约定
- 默认人类可读表格；`--json` 输出稳定 schema（见 references/output-schema.md）
- 退出码：0 成功；1 参数错误；2 依赖不可用；3 部分失败

# 注意
- 结果来自规则核验，非 AI 判定；verdict 字段含义见下表
- 不要在未核实的情况下把 unverified 内容写成"已确认"
```

# 4. CLI 命令

```bash
radar status
radar sources [--json]
radar watch list [--json]
radar watch add "<keyword>" [--aliases a,b] [--exclude x,y]
                              [--min-credibility 0.65] [--interval 1800]
                              [--channels inpage,email] [--json]
radar watch remove <id|keyword>
radar topic list
radar topic add "<name>" --queries "AI 编程,AI coding" [--json]
radar scan [--all] [--watch <id>] [--topic <id>] [--json]
radar hotspots [--topic <name>] [--since 24h] [--min-credibility 0.65]
               [--platform x|web] [--limit 20] [--json]
radar event <id> [--json]
radar brief [--since 24h] [--md] [--json]
radar notify test [--channel email|inpage]
radar feedback <eventId> --verdict false_positive|clickbait|untrusted
```

`--standalone` 可加在任意读取/扫描命令上：直接打开 `DB_PATH`，不依赖 8787。

# 5. 输出 schema（`--json`）

```json
{
  "ok": true,
  "command": "hotspots",
  "generatedAt": "2026-10-24T09:00:00Z",
  "verifyMode": "rules",
  "count": 3,
  "data": [
    {
      "eventId": 42,
      "title": "OpenAI 发布 GPT-5.2",
      "summary": "官方博客称在 SWE-bench 上提升 12%，上下文窗口翻倍。",
      "verdict": "verified",
      "credibility": 0.92,
      "independentDomains": 3,
      "heat": 0.78,
      "firstSeenAt": "2026-10-24T08:12:00Z",
      "lastUpdatedAt": "2026-10-24T08:40:00Z",
      "sources": [
        { "type": "official", "domain": "openai.com", "url": "https://...", "title": "..." }
      ],
      "watchMatches": ["GPT-5"]
    }
  ]
}
```

错误：

```json
{ "ok": false, "error": { "code": "SERVICE_UNAVAILABLE", "message": "服务未启动且 standalone 失败", "detail": "..." } }
```

# 6. 行为细节

| 场景 | 行为 |
|---|---|
| 服务未启动 | 读取 `RADAR_API` 失败 → 自动 `standalone`；仍失败则退出码 2 |
| 关键词已存在 | 返回 409，CLI 输出"已存在，未修改"并退出码 0（幂等） |
| 扫描进行中 | 返回 409 + `jobId`；CLI 可选择等待并轮询 |
| 无结果 | `ok: true, count: 0`，不报错 |
| 只有未证实内容 | 默认不返回；`--include-unverified` 才包含 |
| X 未配置 | `sources` 中 `x.health=unconfigured`，不视为失败 |
| 邮件未配置 | `notify test` 返回 `skipped` 与原因 |

# 7. 示例对话

```
用户：帮我盯着 "Claude 5"，一有官方消息就告诉我。
AI：  （调用 radar watch add "Claude 5" --aliases claude5 --min-credibility 0.65）
      已添加监控。当前可信度门槛 0.65，只推送一手源或多源印证的内容。
      30 分钟扫一轮；也可以现在立即扫描。要现在扫吗？

用户：看看今天 AI 编程有什么值得写的。
AI：  （调用 radar hotspots --topic "AI 编程" --since 24h --min-credibility 0.65 --json）
      给你 3 条已核实的：
      1. ...（可信度 0.92，3 个独立来源）
      2. ...
      另外有 4 条未证实，已放在观察区，需要我列出来吗？
```

# 8. 安装与分发

```bash
# 仓库内开发
node .claude/skills/hotspot-radar/scripts/radar.mjs --help

# 安装给其他 agent（全局）
ln -s "$(pwd)/.claude/skills/hotspot-radar" ~/.claude/skills/hotspot-radar
# 或复制
cp -R .claude/skills/hotspot-radar ~/.claude/skills/
```

- 不写入 `skills-lock.json`（这是自研技能，不是外部安装包）；
- 技能可脱离网页单独使用，但邮件/SSE 需要服务在跑；
- 其他 AI 读取 `SKILL.md` 即可发现命令，无需读源码。

# 9. 与网页版的关系

| 能力 | 网页 | Skill |
|---|---|---|
| 增删关键词 | 有 | 有 |
| 立即扫描 | 有 | 有 |
| 看热点 | 有 | 有 |
| 页面弹窗 | 有 | 无（由调用方 AI 决定如何转述） |
| 邮件 | 有 | 触发测试邮件 |
| 简报 | 有（详情页复制） | `brief --md` 直接输出 Markdown |
