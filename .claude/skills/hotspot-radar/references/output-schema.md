# 输出 Schema（`--json`）

## 成功

```json
{
  "ok": true,
  "verifyMode": "rules",
  "count": 2,
  "data": [
    {
      "id": 42,
      "title": "OpenAI releases GPT-5.2",
      "summary": "官方博客称在 SWE-bench 上提升 12%。",
      "verdict": "verified",
      "credibility": 0.92,
      "heat": 0.78,
      "independent_domains": 3,
      "first_seen_at": "2026-10-24T08:12:00.000Z",
      "last_updated_at": "2026-10-24T08:40:00.000Z",
      "sources": [
        {
          "domain": "openai.com",
          "url": "https://openai.com/index/gpt-5-2",
          "title": "Introducing GPT-5.2",
          "is_first_party": 1,
          "platform": "web",
          "sourceName": "openai"
        }
      ]
    }
  ]
}
```

## 扫描

```json
{
  "ok": true,
  "transport": "http",
  "job": {
    "id": "uuid",
    "status": "done",
    "processed": 12,
    "total": 80,
    "errors": []
  }
}
```

## 失败

```json
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "该关键词已存在"
  }
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `verdict` | string | `verified` / `likely` / `unverified` / `suspicious` |
| `credibility` | number | 0–1，规则核验分数 |
| `independent_domains` | number | 排除 X 与同标题转载后的独立域名数 |
| `heat` | number | 0–1，来源权重 + 时效 + 互动 + 印证 |
| `sources[].is_first_party` | 0/1 | 是否一手来源 |
| `transport` | string | `http` 或 standalone 输出不带该字段 |

## 兼容性

- 新增字段只增不改；调用方应忽略未知字段。
- `verifyMode` 未来可能变为 `hybrid`（接入 AI 后），语义字段保持不变。
