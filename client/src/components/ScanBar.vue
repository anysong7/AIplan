<template>
  <div class="scanbar" :class="{ active }" aria-hidden="true">
    <span class="line" />
    <span class="ticks" />
  </div>
</template>

<script>
export default {
  name: 'ScanBar',
  props: {
    active: { type: Boolean, default: false }
  }
}
</script>

<style scoped>
.scanbar {
  position: relative;
  height: 2px;
  overflow: hidden;
  background: #161d24;
}
.line {
  position: absolute;
  top: 0;
  left: -20%;
  width: 20%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--signal), transparent);
  animation: sweep 8s linear infinite;
}
.active .line {
  animation-duration: 1.2s;
  box-shadow: 0 0 12px rgba(242, 176, 30, 0.8);
}
.ticks {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.12) 0 1px,
    transparent 1px 32px
  );
  opacity: 0.35;
}
@keyframes sweep {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(600%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .line {
    animation: none;
    left: 0;
    width: 100%;
    opacity: 0.35;
  }
}
</style>
