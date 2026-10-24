<template>
  <div class="health">
    <div class="head">
      <span class="label">Sources</span>
      <span class="mono count">{{ healthy }}/{{ items.length }}</span>
    </div>
    <ul>
      <li v-for="source in visible" :key="source.id">
        <span class="dot" :class="source.health || 'ok'" :title="source.health" />
        <span class="name">{{ source.name }}</span>
        <span class="mono at">{{ lastFetch(source) }}</span>
      </li>
    </ul>
    <p v-if="items.length > visible.length" class="mono more">
      +{{ items.length - visible.length }} more
    </p>
  </div>
</template>

<script>
import { clock } from '../utils.js'

export default {
  name: 'SourceHealth',
  props: {
    sources: { type: Array, default: () => [] },
    limit: { type: Number, default: 6 }
  },
  computed: {
    items() {
      return this.sources.filter((s) => s.enabled !== 0)
    },
    visible() {
      return this.items.slice(0, this.limit)
    },
    healthy() {
      return this.items.filter((s) => s.health === 'ok').length
    }
  },
  methods: {
    lastFetch(source) {
      return source.last_fetch_at ? clock(source.last_fetch_at) : '—'
    }
  }
}
</script>

<style scoped>
.health {
  padding: var(--s3) 0;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--s2);
}
.count {
  font-size: 10px;
  color: var(--muted-2);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 5px;
}
li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--paper-dim);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--watch);
}
.dot.ok {
  background: var(--verified);
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}
.dot.degraded {
  background: var(--danger);
}
.dot.disabled {
  background: #3b4652;
}
.dot.unconfigured {
  background: #56616d;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.at {
  font-size: 9px;
  color: var(--muted-2);
}
.more {
  margin-top: 6px;
  font-size: 9px;
  color: var(--muted-2);
}
</style>
