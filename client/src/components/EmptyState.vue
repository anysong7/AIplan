<template>
  <div class="empty">
    <div class="scope" aria-hidden="true">
      <span class="ring" />
      <span class="dot" />
    </div>
    <h2 class="title">{{ title }}</h2>
    <p class="text">{{ text }}</p>
    <slot />
  </div>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    title: { type: String, default: '雷达静默' },
    text: { type: String, default: '添加一个关键词，或者立即扫描一次。' }
  }
}
</script>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  gap: var(--s3);
  padding: var(--s8) var(--s4);
  text-align: center;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.01);
}
.scope {
  position: relative;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
}
.ring {
  width: 64px;
  height: 64px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}
.ring::after {
  content: '';
  position: absolute;
  inset: 12px;
  border: 1px solid var(--line);
  border-radius: 50%;
}
.dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 10px var(--signal);
  animation: pulse 2.4s ease-in-out infinite;
}
.title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
}
.text {
  max-width: 38ch;
  color: var(--muted);
  font-size: 13px;
}
@keyframes pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}
</style>
