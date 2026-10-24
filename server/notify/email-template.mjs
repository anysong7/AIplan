const VERDICT_LABEL = {
  verified: '已核实',
  likely: '较可信',
  unverified: '未证实',
  suspicious: '疑似不实'
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateLabel(iso) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso))
  } catch {
    return String(iso || '')
  }
}

export function buildEmail(payloads = []) {
  const list = payloads.slice(0, 20)
  const count = list.length
  const first = list[0] || {}
  const subject =
    count <= 1
      ? `[SIGNAL] ${VERDICT_LABEL[first.verdict] || '新热点'} · ${(first.title || '热点提醒').slice(0, 60)}`
      : `[SIGNAL] ${count} 条新热点 · ${dateLabel(new Date().toISOString()).slice(0, 10)}`
  const now = dateLabel(new Date().toISOString())

  const cards = list
    .map((p) => {
      const sources = (p.sources || [])
        .slice(0, 4)
        .map(
          (s) =>
            `<a href="${escapeHtml(s.url)}" style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;border:1px solid #d8d2c2;border-radius:2px;color:#4a463c;text-decoration:none;font-size:11px;">${escapeHtml(
              s.domain
            )}${s.firstParty ? ' · 一手' : ''}</a>`
        )
        .join('')
      return `
      <tr><td style="padding:0 0 22px 0;">
        <div style="height:3px;background:${p.verdict === 'verified' ? '#2f9e5f' : '#c99a1a'};width:44px;margin-bottom:12px;"></div>
        <h2 style="margin:0 0 8px;font-family:Georgia,'Songti SC',serif;font-size:20px;line-height:1.35;color:#161611;font-weight:600;">${escapeHtml(
          p.title
        )}</h2>
        <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#3f3b33;">${escapeHtml(
          p.summary || ''
        )}</p>
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6b665a;margin-bottom:10px;">
          可信度 ${Math.round((p.credibility || 0) * 100)} · ${p.independentDomains || 1} 个独立来源 ·
          ${escapeHtml(VERDICT_LABEL[p.verdict] || p.verdict || '')} · 监控：${escapeHtml(p.target || '')}
        </div>
        <div style="margin-bottom:12px;">${sources}</div>
        <a href="${escapeHtml(p.readUrl || '')}" style="display:inline-block;padding:8px 14px;background:#161611;color:#f7f4ec;text-decoration:none;font-size:13px;border-radius:2px;">在雷达中查看</a>
        ${
          p.sources && p.sources[0]
            ? `<a href="${escapeHtml(p.sources[0].url)}" style="display:inline-block;padding:8px 14px;margin-left:8px;border:1px solid #161611;color:#161611;text-decoration:none;font-size:13px;border-radius:2px;">阅读原文</a>`
            : ''
        }
      </td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#eae6da;">
  <div style="max-width:600px;margin:0 auto;background:#f7f4ec;border:1px solid #ded8c8;">
    <div style="padding:22px 28px 14px;border-bottom:2px solid #161611;">
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:.18em;color:#161611;font-weight:700;">SIGNAL</div>
      <div style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:12px;color:#6b665a;margin-top:6px;">信号雷达 · ${now} · ${count} 条</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 28px;">
      ${cards}
    </table>
    <div style="padding:16px 28px 24px;border-top:1px solid #ded8c8;font-family:-apple-system,'PingFang SC',sans-serif;font-size:11px;line-height:1.8;color:#7a7568;">
      规则核验：一手源或多源印证才会推送，未证实内容仅在雷达观察区展示。<br>
      管理通知：<a href="http://127.0.0.1:8787/#/settings" style="color:#8a6a12;">设置</a>
    </div>
  </div>
</body></html>`

  const text = list
    .map(
      (p) =>
        `● ${p.title}\n  可信度 ${Math.round((p.credibility || 0) * 100)} · ${
          p.independentDomains || 1
        } 个独立来源 · ${VERDICT_LABEL[p.verdict] || p.verdict}\n  ${p.summary || ''}\n  ${
          p.sources?.[0]?.url || p.readUrl || ''
        }\n`
    )
    .join('\n')

  return { subject, html, text }
}
