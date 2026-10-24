<template>
  <div v-if="payload" class="overlay" @click.self="$emit('close')">
    <div
      ref="panel"
      class="modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-title"
      tabindex="-1"
      @keydown.esc.prevent="$emit('close')"
    >
      <div class="kicker mono">
        HIGH PRIORITY · {{ Math.round((payload.score || 0) * 100) }}
      </div>
      <h2 id="alert-title" class="title">{{ payload.title }}</h2>
      <p class="summary">{{ payload.summary }}</p>
      <div class="sources">
        <span v-for="source in (payload.sources || []).slice(0, 4)" :key="source.url" class="chip">
          {{ source.domain }}
        </span>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="button" @click="$emit('open', payload.eventId)">
          查看证据
        </button>
        <button class="btn btn-ghost" type="button" @click="$emit('close')">知道了</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AlertModal',
  props: {
    payload: { type: Object, default: null }
  },
  watch: {
    payload(value) {
      if (!value) return
      this.$nextTick(() => this.$refs.panel?.focus())
    }
  },
  mounted() {
    document.addEventListener('keydown', this.onKey)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKey)
  },
  methods: {
    onKey(event) {
      if (event.key === 'Escape' && this.payload) this.$emit('close')
    }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 6, 8, 0.72);
  backdrop-filter: blur(3px);
}
.modal {
  width: min(520px, 100%);
  padding: 26px;
  background: #10161c;
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--signal);
  box-shadow: var(--shadow);
}
.kicker {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--signal);
  margin-bottom: 10px;
}
.title {
  font-family: var(--font-display);
  font-size: 24px;
  line-height: 1.35;
  font-weight: 600;
}
.summary {
  margin-top: 10px;
  color: var(--paper-dim);
  font-size: 13px;
  line-height: 1.7;
}
.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
</style>
