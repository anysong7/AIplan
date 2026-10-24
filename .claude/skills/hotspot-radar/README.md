# Hotspot Radar Skill

把本目录复制或软链到 agent 的技能目录即可：

```bash
# 全局安装（Claude Code 等）
ln -s "$(pwd)/.claude/skills/hotspot-radar" ~/.claude/skills/hotspot-radar

# 或复制
cp -R .claude/skills/hotspot-radar ~/.claude/skills/
```

验证：

```bash
node .claude/skills/hotspot-radar/scripts/radar.mjs --help
node .claude/skills/hotspot-radar/scripts/radar.mjs status
```

- 服务在跑：走 HTTP `http://127.0.0.1:8787`
- 服务未跑：自动调用 `server/cli/radar.mjs`（可用 `RADAR_ROOT` 指定项目根）
- 邮件/页面弹窗需要服务运行；查询与扫描的 standalone 模式不需要
