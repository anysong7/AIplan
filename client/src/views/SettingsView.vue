<template>
  <div class="settings">
    <header class="head">
      <div>
        <span class="label">Console</span>
        <h1>设置与运行状态</h1>
        <p class="sub">本期为规则核验，未接入 AI；所有密钥只从服务端环境变量读取。</p>
      </div>
    </header>

    <section class="cards">
      <div class="card">
        <span class="label">采集周期</span>
        <strong class="mono">{{ Math.round(cfg.scanIntervalSec / 60) }} MIN</strong>
        <small>每轮 HN / Bing / RSS / GitHub / sitemap</small>
      </div>
      <div class="card">
        <span class="label">核验模式</span>
        <strong class="mono">{{ cfg.verifyMode }}</strong>
        <small>AI {{ cfg.aiEnabled ? '已启用' : '未启用' }} · 门槛 {{ Math.round(cfg.pushMinCredibility * 100) }}</small>
      </div>
      <div class="card">
        <span class="label">邮件通道</span>
        <strong class="mono">{{ cfg.mailTransport }}</strong>
        <small>{{ cfg.mailTo }}</small>
      </div>
      <div class="card">
        <span class="label">X / GDELT</span>
        <strong class="mono">{{ cfg.xEnabled ? 'X ON' : 'X OFF' }} · {{ cfg.gdeltEnabled ? 'ON' : 'OFF' }}</strong>
        <small>X 需要试用额度；GDELT 待复测</small>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <span class="label">Notifications</span>
          <h2>邮件测试</h2>
        </div>
        <button class="btn btn-primary" type="button" :disabled="sending" @click="sendTest">
          <Icon name="mail" /> {{ sending ? '发送中…' : '发送测试邮件' }}
        </button>
      </div>
      <p class="note">
        当前使用 Ethereal 测试箱：不会真实送达 {{ cfg.mailTo }}，但会走完整 SMTP 流程并生成预览链接。
        切换真实投递：把 <code>MAIL_TRANSPORT</code> 改为 <code>smtp</code> 并填写 163 授权码。
      </p>
      <div v-if="mailResult" class="result">
        <span class="mono ok">SENT · {{ mailResult.mode }}</span>
        <a v-if="mailResult.previewUrl" :href="mailResult.previewUrl" target="_blank" rel="noopener noreferrer">
          打开邮件预览 <Icon name="external" />
        </a>
        <span v-else class="mono muted">已生成 .eml，可在 data/mail-preview/ 查看</span>
      </div>
      <p v-if="mailError" class="error" role="alert">{{ mailError }}</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <span class="label">Preferences</span>
          <h2>页面弹窗与免打扰</h2>
        </div>
        <button class="btn btn-ghost" type="button" @click="save">保存</button>
      </div>
      <div class="form-grid">
        <label class="field-wrap">
          <span class="label">Toast 时长 (ms)</span>
          <input v-model.number="form.inpageToastMs" class="field" type="number" min="2000" max="15000" />
        </label>
        <label class="field-wrap">
          <span class="label">高优先弹窗阈值</span>
          <input v-model.number="form.inpageModalMinScore" class="field" type="number" min="0.5" max="1" step="0.01" />
        </label>
        <label class="field-wrap">
          <span class="label">免打扰时段</span>
          <input v-model.trim="form.mailQuietHours" class="field" placeholder="23:00-08:00（留空关闭）" />
        </label>
        <label class="field-wrap">
          <span class="label">最低可信度</span>
          <input v-model.number="form.pushMinCredibility" class="field" type="number" min="0" max="1" step="0.05" />
        </label>
      </div>
      <p v-if="saveHint" class="hint">{{ saveHint }}</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <span class="label">Sources</span>
          <h2>采集源健康度</h2>
        </div>
        <button class="btn btn-ghost" type="button" @click="refresh">
          <Icon name="refresh" /> 刷新
        </button>
      </div>
      <div class="table">
        <div class="tr th mono">
          <span>SOURCE</span><span>HEALTH</span><span>LAST</span><span>CALLS</span>
        </div>
        <div v-for="source in sources" :key="source.id" class="tr">
          <span class="name">
            <i class="dot" :class="source.enabled ? source.health : 'disabled'" />
            {{ source.name }}
            <em class="mono">{{ source.kind }}</em>
          </span>
          <span class="mono">{{ source.enabled ? source.health : 'disabled' }}</span>
          <span class="mono muted">{{ source.last_fetch_at ? clock(source.last_fetch_at) : '—' }}</span>
          <span class="mono">{{ source.usage?.calls || 0 }}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <span class="label">Delivery</span>
          <h2>最近投递</h2>
        </div>
      </div>
      <div v-if="notifications.length" class="deliveries">
        <div v-for="item in notifications.slice(0, 8)" :key="item.id" class="delivery">
          <span class="mono status" :class="item.status">{{ item.channel }} / {{ item.status }}</span>
          <span class="title">{{ item.title || '测试邮件' }}</span>
          <a v-if="item.preview_url" :href="item.preview_url" target="_blank" rel="noopener noreferrer">预览</a>
          <span v-else class="mono muted">{{ item.last_error || '—' }}</span>
          <span class="mono when">{{ clock(item.created_at) }}</span>
        </div>
      </div>
      <p v-else class="note">还没有投递记录。发送一封测试邮件试试。</p>
    </section>

    <p class="compliance">
      合规声明：只使用公开 RSS/API 与 sitemap，遵守 robots.txt；不抓取搜索引擎结果页；只保存标题、短摘要与链接。
      规则核验无法识别所有编造内容，请以原文与一手来源为准。
    </p>
  </div>
</template>

<script>
import Icon from '../components/Icon.vue'
import { api } from '../api.js'
import { store } from '../store.js'
import { clock } from '../utils.js'

export default {
  name: 'SettingsView',
  components: { Icon },
  data() {
    return {
      data: null,
      sending: false,
      mailResult: null,
      mailError: '',
      saveHint: '',
      form: {
        inpageToastMs: 4800,
        inpageModalMinScore: 0.88,
        mailQuietHours: '',
        pushMinCredibility: 0.65
      }
    }
  },
  computed: {
    cfg() {
      return this.data?.config || {}
    },
    sources() {
      return store.state.sources
    },
    notifications() {
      return store.state.notifications
    }
  },
  async mounted() {
    await this.refresh()
    await Promise.all([store.loadNotifications(), store.loadUsage()])
  },
  methods: {
    clock,
    async refresh() {
      this.data = await api.settings()
      this.form = {
        inpageToastMs: this.data.config.inpageToastMs,
        inpageModalMinScore: this.data.config.inpageModalMinScore,
        mailQuietHours: this.data.config.mailQuietHours || '',
        pushMinCredibility: this.data.config.pushMinCredibility
      }
    },
    async sendTest() {
      this.sending = true
      this.mailError = ''
      this.mailResult = null
      try {
        this.mailResult = await api.testEmail()
      } catch (err) {
        this.mailError = err.message
      } finally {
        this.sending = false
      }
    },
    async save() {
      this.saveHint = ''
      try {
        await api.saveSettings(this.form)
        this.saveHint = '已保存（立即生效，重启后保留）。'
        await this.refresh()
      } catch (err) {
        this.saveHint = err.message
      }
    }
  }
}
</script>

<style scoped>
.settings {
  display: grid;
  gap: var(--s5);
  align-content: start;
}
h1 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  margin-top: 2px;
}
.sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--line);
  background: var(--panel);
}
.card strong {
  font-size: 18px;
  font-weight: 500;
  color: var(--signal);
}
.card small {
  color: var(--muted-2);
  font-size: 11px;
  line-height: 1.5;
}
.panel {
  padding: var(--s4);
  border: 1px solid var(--line);
  background: var(--panel);
}
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s3);
  margin-bottom: var(--s3);
}
.panel h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin-top: 2px;
}
.note {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.8;
}
code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--signal);
  background: rgba(242, 176, 30, 0.08);
  padding: 1px 4px;
}
.result {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid rgba(74, 222, 128, 0.3);
  background: rgba(74, 222, 128, 0.06);
  font-size: 12px;
  flex-wrap: wrap;
}
.ok {
  color: var(--verified);
  font-size: 10px;
}
.error {
  color: var(--danger);
  font-size: 12px;
  margin-top: 8px;
}
.hint {
  color: var(--verified);
  font-size: 12px;
  margin-top: 8px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.field-wrap {
  display: grid;
  gap: 3px;
}
.table {
  display: grid;
  font-size: 12px;
}
.tr {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 80px 70px 60px;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--line);
  align-items: center;
}
.th {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--muted-2);
}
.name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name em {
  font-style: normal;
  font-size: 9px;
  color: var(--muted-2);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--watch);
  flex: none;
}
.dot.ok {
  background: var(--verified);
}
.dot.degraded {
  background: var(--danger);
}
.dot.disabled {
  background: #3b4652;
}
.muted {
  color: var(--muted-2);
}
.deliveries {
  display: grid;
  gap: 6px;
}
.delivery {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) auto 48px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.status {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.status.sent {
  color: var(--verified);
}
.status.failed {
  color: var(--danger);
}
.status.queued,
.status.sending {
  color: var(--signal);
}
.delivery .title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.when {
  font-size: 9px;
  color: var(--muted-2);
  text-align: right;
}
.compliance {
  border-top: 1px solid var(--line);
  padding-top: 14px;
  color: var(--muted-2);
  font-size: 11px;
  line-height: 1.8;
}
@media (max-width: 1024px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .cards,
  .form-grid {
    grid-template-columns: 1fr;
  }
  .tr {
    grid-template-columns: minmax(0, 1fr) 60px 50px;
  }
  .tr > :nth-child(3) {
    display: none;
  }
  .delivery {
    grid-template-columns: 1fr auto;
  }
  .delivery .title {
    grid-column: 1 / -1;
    order: 2;
  }
}
</style>


