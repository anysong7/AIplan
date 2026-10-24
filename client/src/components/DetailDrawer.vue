<template>
  <div v-if="detail || loading" class="overlay" @click.self="$emit('close')">
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      tabindex="-1"
      @keydown.esc.prevent="$emit('close')"
    >
      <header class="top">
        <span class="kicker mono">EVENT / {{ event?.id || '—' }}</span>
        <button class="btn btn-ghost close" type="button" aria-label="关闭详情" @click="$emit('close')">
          <Icon name="close" />
        </button>
      </header>

      <div v-if="loading" class="loading">
        <div class="skeleton line w70" />
        <div class="skeleton line w90" />
        <div class="skeleton block-skeleton" />
      </div>

      <template v-else-if="event">
        <div class="meta">
          <span class="verdict" :class="`v-${tone}`">{{ verdict.label }}</span>
          <span class="mono score">可信度 {{ Math.round(event.credibility * 100) }}</span>
          <span class="mono heat">热度 {{ Math.round(event.heat * 100) }}</span>
        </div>
        <h2 id="drawer-title" class="title">{{ event.title }}</h2>
        <p v-if="summary" class="summary">{{ summary }}</p>

        <div class="actions">
          <a
            v-if="primaryUrl"
            class="btn btn-primary"
            :href="primaryUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            阅读原文 <Icon name="external" />
          </a>
          <button class="btn btn-ghost" type="button" @click="copyLink">
            {{ copied ? '已复制' : '复制链接' }}
          </button>
        </div>

        <section class="block">
          <div class="block-head">
            <span class="label">Score breakdown</span>
            <span class="mono">规则核验</span>
          </div>
          <div class="bars">
            <div class="bar-row">
              <span>来源权重</span>
              <div class="track"><i :style="{ width: `${pct(event.source_trust)}%` }" /></div>
              <span class="mono">{{ Math.round(event.source_trust * 100) }}</span>
            </div>
            <div class="bar-row">
              <span>多源印证</span>
              <div class="track"><i class="teal" :style="{ width: `${pct(event.corroboration)}%` }" /></div>
              <span class="mono">{{ event.independent_domains }} 域</span>
            </div>
            <div class="bar-row">
              <span>传闻风险</span>
              <div class="track"><i class="red" :style="{ width: `${pct(event.rumor)}%` }" /></div>
              <span class="mono">{{ Math.round(event.rumor * 100) }}</span>
            </div>
          </div>
          <p class="note">
            规则核验：一手源或多源印证才推送；未证实内容仅在观察区展示，不代表已确认真实。
          </p>
        </section>

        <section class="block">
          <EvidenceChain :items="items" />
        </section>

        <section class="block">
          <div class="block-head">
            <span class="label">Feedback</span>
          </div>
          <div class="feedback">
            <button class="btn btn-ghost" type="button" @click="feedback('false_positive')">误报</button>
            <button class="btn btn-ghost" type="button" @click="feedback('clickbait')">标题党</button>
            <button class="btn btn-ghost" type="button" @click="feedback('untrusted')">来源不可信</button>
          </div>
        </section>
      </template>
    </aside>
  </div>
</template>

<script>
import Icon from './Icon.vue'
import EvidenceChain from './EvidenceChain.vue'
import { store } from '../store.js'
import { verdictOf } from '../utils.js'
import { api } from '../api.js'

export default {
  name: 'DetailDrawer',
  components: { Icon, EvidenceChain },
  props: {
    detail: { type: Object, default: null },
    loading: { type: Boolean, default: false }
  },
  data() {
    return { copied: false }
  },
  computed: {
    event() {
      return this.detail?.event || null
    },
    items() {
      return this.detail?.items || []
    },
    verdict() {
      return verdictOf(this.event?.verdict)
    },
    tone() {
      return this.verdict.tone
    },
    primaryUrl() {
      const first = this.items.find((i) => i.is_first_party) || this.items[0]
      return first?.canonical_url || ''
    },
    summary() {
      const summary = String(this.event?.summary || '').trim()
      return summary && summary !== String(this.event?.title || '').trim() ? summary : ''
    }
  },
  watch: {
    detail(value) {
      if (value?.event && (value.alerts || []).some((a) => !a.read_at)) {
        store.markDetailRead()
      }
    }
  },
  methods: {
    pct(value) {
      return Math.max(4, Math.min(100, Math.round(Number(value || 0) * 100)))
    },
    async copyLink() {
      try {
        await navigator.clipboard.writeText(window.location.href)
        this.copied = true
        setTimeout(() => {
          this.copied = false
        }, 1600)
      } catch {
        this.copied = false
      }
    },
    async feedback(verdict) {
      const item = this.items[0]
      try {
        await api.feedback({ itemId: item?.id, verdict })
        store.pushToast({
          title: '反馈已记录',
          summary: '感谢，规则会据此调整来源权重（下一轮生效）。',
          verdict: 'verified',
          score: 0.7
        })
      } catch (err) {
        store.pushToast({ title: '提交失败', summary: err.message, verdict: 'suspicious', score: 0 })
      }
    }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(4, 6, 8, 0.55);
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(var(--aside-w), 100%);
  height: 100%;
  overflow-y: auto;
  padding: 18px 22px 40px;
  background: #0e1419;
  border-left: 1px solid var(--line-strong);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.45);
  animation: slide 240ms var(--ease);
}
@keyframes slide {
  from {
    transform: translateX(16px);
    opacity: 0.4;
  }
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kicker {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--muted-2);
}
.close {
  min-height: 36px;
  padding: 0 8px;
}
.meta {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin: 14px 0 6px;
}
.verdict {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
}
.v-verified {
  color: var(--verified);
}
.v-likely {
  color: var(--likely);
}
.v-unverified {
  color: var(--watch);
}
.v-suspicious {
  color: var(--danger);
}
.score,
.heat {
  font-size: 9px;
  color: var(--muted-2);
}
.title {
  font-family: var(--font-display);
  font-size: 25px;
  line-height: 1.35;
  font-weight: 600;
}
.summary {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--paper-dim);
}
.actions {
  display: flex;
  gap: 8px;
  margin: 18px 0 24px;
  flex-wrap: wrap;
}
.block {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.block-head .mono {
  font-size: 9px;
  color: var(--muted-2);
}
.bars {
  display: grid;
  gap: 9px;
}
.bar-row {
  display: grid;
  grid-template-columns: 64px 1fr 52px;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--paper-dim);
}
.bar-row .mono {
  text-align: right;
  font-size: 9px;
  color: var(--muted-2);
}
.track {
  height: 4px;
  background: #1b242c;
  overflow: hidden;
}
.track i {
  display: block;
  height: 100%;
  background: var(--signal);
}
.track i.teal {
  background: var(--verified);
}
.track i.red {
  background: var(--danger);
}
.note {
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted-2);
}
.feedback {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.feedback .btn {
  min-height: 32px;
  font-size: 12px;
}
.loading {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}
.line {
  height: 14px;
}
.w70 {
  width: 70%;
}
.w90 {
  width: 90%;
}
.block-skeleton {
  height: 160px;
}
@media (max-width: 768px) {
  .overlay {
    align-items: flex-end;
  }
  .drawer {
    width: 100%;
    height: 92%;
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    animation: up 240ms var(--ease);
  }
  @keyframes up {
    from {
      transform: translateY(24px);
      opacity: 0.5;
    }
  }
}
</style>

