<template>
  <article
    class="card"
    :class="[`tone-${tone}`, { selected }]"
    tabindex="0"
    role="button"
    :aria-label="`打开事件：${event.title}`"
    @click="$emit('open', event.id)"
    @keydown.enter.prevent="$emit('open', event.id)"
    @keydown.space.prevent="$emit('open', event.id)"
  >
    <SignalBar :heat="event.heat || 0" />
    <div class="body">
      <div class="meta-top">
        <span class="verdict" :class="`v-${tone}`">
          <Icon :name="tone === 'verified' ? 'check' : tone === 'suspicious' ? 'alert' : 'clock'" />
          {{ label }}
        </span>
        <span v-if="event.independent_domains >= 2" class="chip">
          {{ event.independent_domains }} 个独立源
        </span>
        <span class="time mono">{{ timeAgo(event.last_updated_at) }}</span>
      </div>

      <h2 class="title">{{ event.title }}</h2>
      <p v-if="summary" class="summary">{{ summary }}</p>

      <div class="meta-bottom">
        <div class="doms">
          <span v-for="source in (event.sources || []).slice(0, 3)" :key="source.url" class="dom mono">
            {{ source.domain }}<em v-if="source.is_first_party">一手</em>
          </span>
        </div>
        <span class="heat mono">HEAT {{ Math.round((event.heat || 0) * 100) }}</span>
      </div>
    </div>
    <CredibilityRing :value="event.credibility || 0" :size="42" />
  </article>
</template>

<script>
import Icon from './Icon.vue'
import SignalBar from './SignalBar.vue'
import CredibilityRing from './CredibilityRing.vue'
import { timeAgo, verdictOf } from '../utils.js'

export default {
  name: 'HotspotCard',
  components: { Icon, SignalBar, CredibilityRing },
  props: {
    event: { type: Object, required: true },
    selected: { type: Boolean, default: false }
  },
  computed: {
    verdict() {
      return verdictOf(this.event.verdict)
    },
    label() {
      return this.verdict.label
    },
    tone() {
      return this.verdict.tone
    },
    summary() {
      const summary = String(this.event.summary || '').trim()
      return summary && summary !== String(this.event.title || '').trim() ? summary : ''
    }
  },
  methods: { timeAgo }
}
</script>

<style scoped>
.card {
  display: grid;
  grid-template-columns: 3px minmax(0, 1fr) auto;
  gap: var(--s4);
  padding: var(--s4) var(--s4) var(--s4) var(--s3);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.012), transparent), var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 180ms var(--ease), background 180ms var(--ease), transform 180ms var(--ease);
}
.card:hover {
  border-color: #33414f;
  background: var(--panel-2);
}
.card.selected {
  border-color: var(--signal-dim);
}
.card:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 2px;
}
.body {
  min-width: 0;
}
.meta-top {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
.verdict .icon {
  width: 12px;
  height: 12px;
}
.time {
  margin-left: auto;
  font-size: 10px;
  color: var(--muted-2);
}
.title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.01em;
  color: var(--paper);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.summary {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--paper-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta-bottom {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin-top: 10px;
  flex-wrap: wrap;
}
.doms {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dom {
  font-size: 10px;
  color: var(--muted);
  border-bottom: 1px solid transparent;
}
.dom em {
  font-style: normal;
  color: var(--signal);
  margin-left: 3px;
}
.heat {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--muted-2);
}
@media (max-width: 560px) {
  .title {
    font-size: 17px;
  }
  .summary {
    -webkit-line-clamp: 2;
  }
}
</style>
