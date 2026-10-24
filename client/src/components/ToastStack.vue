<template>
  <transition-group name="toast" tag="div" class="toasts" aria-live="polite" aria-atomic="false">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`t-${toast.verdict}`"
      @mouseenter="pause(toast.id)"
      @mouseleave="resume(toast.id)"
      @focusin="pause(toast.id)"
      @focusout="resume(toast.id)"
    >
      <span class="bar" />
      <div class="content">
        <div class="meta">
          <span class="badge mono">{{ verdictLabel(toast.verdict) }}</span>
          <span class="mono score">{{ Math.round(toast.score * 100) }}</span>
          <span class="mono target">{{ toast.target }}</span>
        </div>
        <p class="title">{{ toast.title }}</p>
        <p v-if="toast.summary" class="summary">{{ toast.summary }}</p>
        <div class="actions">
          <button class="link" type="button" @click="open(toast)">查看</button>
          <button class="link ghost" type="button" @click="remove(toast.id)">关闭</button>
        </div>
      </div>
    </div>
  </transition-group>
</template>

<script>
import { store } from '../store.js'
import { verdictOf } from '../utils.js'

export default {
  name: 'ToastStack',
  computed: {
    toasts() {
      return store.state.toasts
    }
  },
  methods: {
    verdictLabel(value) {
      return verdictOf(value).short
    },
    open(toast) {
      this.$emit('open', toast.eventId)
      store.removeToast(toast.id)
    },
    remove(id) {
      store.removeToast(id)
    },
    pause(id) {
      store.pauseToast(id)
    },
    resume(id) {
      store.resumeToast(id)
    }
  }
}
</script>

<style scoped>
.toasts {
  position: fixed;
  top: calc(var(--topbar-h) + 16px);
  right: 18px;
  width: min(360px, calc(100vw - 36px));
  display: grid;
  gap: 10px;
  z-index: 60;
  pointer-events: none;
}
.toast {
  position: relative;
  display: grid;
  grid-template-columns: 3px 1fr;
  gap: 12px;
  padding: 12px 14px 12px 10px;
  background: #121920;
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow);
  pointer-events: auto;
  overflow: hidden;
}
.bar {
  background: var(--signal);
}
.t-verified .bar {
  background: var(--verified);
}
.t-suspicious .bar {
  background: var(--danger);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.badge {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--signal);
}
.t-verified .badge {
  color: var(--verified);
}
.score {
  font-size: 9px;
  color: var(--muted-2);
}
.target {
  margin-left: auto;
  font-size: 9px;
  color: var(--muted-2);
}
.title {
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.45;
  color: var(--paper);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.summary {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--signal);
  font-size: 12px;
}
.link.ghost {
  color: var(--muted);
}
.link:hover {
  text-decoration: underline;
}
.toast-enter-active,
.toast-leave-active {
  transition: transform 220ms var(--ease), opacity 220ms var(--ease);
}
.toast-enter,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (max-width: 768px) {
  .toasts {
    top: 12px;
    left: 12px;
    right: 12px;
    width: auto;
  }
}
</style>
