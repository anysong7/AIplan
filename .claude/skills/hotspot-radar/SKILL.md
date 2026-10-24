---
name: hotspot-radar
description: 监控 AI 热点与关键词。当用户想追踪大模型更新、AI 编程热点、设置关键词告警、查看可信热点或生成每日热点简报时使用。
---

# Hotspot Radar（SIGNAL · 信号雷达）

本技能连接本机的 SIGNAL 服务，提供关键词监控、热点查询、立即扫描与简报生成。
服务未启动时自动退回 `--standalone` 模式，直接读取本地 SQLite 并执行一次扫描。

## 何时使用

- 「帮我盯着 GPT-5 / Claude 5，有消息告诉我」
- 「今天 AI 编程有什么热点？」
- 「把过去 24 小时的热点整理成简报」
- 「这条消息可信吗？来源有哪些？」

## 前置条件

- 默认服务地址：`http://127.0.0.1:8787`
- 可通过 `RADAR_API` 覆盖
- standalone 模式需要 `RADAR_ROOT` 指向项目根目录（脚本会尝试自动推断）
- 邮件与页面弹窗依赖服务运行；纯 CLI 查询不依赖

## 命令

```bash
node .claude/skills/hotspot-radar/scripts/radar.mjs status
node .claude/skills/hotspot-radar/scripts/radar.mjs sources [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs hotspots --since 24h --min-credibility 0.65 --limit 20 [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs watch list [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs watch add "GPT-5" --aliases gpt5,chatgpt [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs watch remove <id|keyword>
node .claude/skills/hotspot-radar/scripts/radar.mjs scan [--all] [--watch <id>] [--topic <id>] [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs brief [--md] [--json]
node .claude/skills/hotspot-radar/scripts/radar.mjs notify test [--json]
```

## 输出约定

- 默认人类可读；加 `--json` 输出稳定结构（见 `references/output-schema.md`）
- 退出码：`0` 成功；`2` 参数/依赖错误
- `verifyMode` 本期固定为 `rules`（规则核验，非 AI 判定）

## verdict 语义（必须如实转述）

| 值 | 含义 | 是否已推送 |
|---|---|---|
| `verified` | 一手源，或高权重 + 多源印证 | 是 |
| `likely` | ≥2 个独立域名，且可信度 ≥ 0.75 | 是 |
| `unverified` | 证据不足，只在观察区 | 否 |
| `suspicious` | 传闻/高仿/仿冒域名 | 否 |

> 不要把 `unverified` 描述成「已确认」。回答时引用 `independentDomains` 与 `sources` 作为依据。

## 行为建议

1. 用户给出关键词后，先 `watch add`，再询问是否立即 `scan`；
2. 汇总热点时按 `credibility` 降序，并给出独立来源数量；
3. 用户要求「写稿」时用 `brief --md`，它只输出已核实/较可信内容；
4. 遇到 `ok:false`，把 `error.code/message` 原样转述，并建议检查服务或网络；
5. 不要编造未在 `sources` 中出现的链接。

## 失败处理

| 情况 | 表现 | 建议 |
|---|---|---|
| 服务未启动 | 自动 standalone；仍失败则退出码 2 | `npm start` 或检查 `RADAR_ROOT` |
| 源不可达 | `scan` 返回 `errors[]` | 说明部分源失败，其他结果仍可用 |
| X 未配置 | `sources` 中 `x` 为 `disabled` | 这是预期行为 |
| 邮件未配置 | `notify test` 报错 | 检查 `MAIL_TRANSPORT` 与 `.env` |
