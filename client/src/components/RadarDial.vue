<template>
  <button class="dial" type="button" :class="{ scanning }" :disabled="scanning" @click="$emit('scan')">
    <span class="sweep" aria-hidden="true" />
    <span class="ring r1" aria-hidden="true" />
    <span class="ring r2" aria-hidden="true" />
    <span class="ring r3" aria-hidden="true" />
    <span class="cross" aria-hidden="true" />
    <span class="core">
      <strong class="mono">{{ count }}</strong>
      <small>24H 事件</small>
    </span>
    <span class="hint mono">{{ scanning ? 'SCANNING' : 'SCAN NOW' }}</span>
  </button>
</template>

<script>
export default {
  name: 'RadarDial',
  props: {
    count: { type: Number, default: 0 },
    scanning: { type: Boolean, default: false }
  }
}
</script>

<style scoped>
.dial {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-width: 200px;
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, rgba(242, 176, 30, 0.06), transparent 62%),
    #0d1217;
  color: var(--paper);
  overflow: hidden;
  transition: border-color 200ms var(--ease), transform 200ms var(--ease);
}
.dial:hover {
  border-color: var(--signal-dim);
}
.dial:active {
  transform: scale(0.995);
}
.ring {
  position: absolute;
  border: 1px solid rgba(242, 176, 30, 0.14);
  border-radius: 50%;
}
.r1 {
  inset: 12%;
}
.r2 {
  inset: 28%;
}
.r3 {
  inset: 42%;
}
.cross {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent calc(50% - 0.5px), rgba(255, 255, 255, 0.08) 50%, transparent calc(50% + 0.5px)),
    linear-gradient(0deg, transparent calc(50% - 0.5px), rgba(255, 255, 255, 0.08) 50%, transparent calc(50% + 0.5px));
}
.sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(242, 176, 30, 0.22),
    rgba(242, 176, 30, 0.04) 55deg,
    transparent 90deg,
    transparent 360deg
  );
  animation: rotate 8s linear infinite;
}
.scanning .sweep {
  animation-duration: 1.4s;
}
.core {
  position: absolute;
  inset: 30%;
  display: grid;
  place-content: center;
  gap: 2px;
  text-align: center;
  border-radius: 50%;
  background: #0b1015;
  border: 1px solid var(--line);
}
.core strong {
  font-size: 26px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--signal);
}
.core small {
  font-size: 9px;
  letter-spacing: 0.16em;
  color: var(--muted-2);
}
.hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10%;
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--muted-2);
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sweep {
    animation: none;
    background: conic-gradient(from 0deg, rgba(242, 176, 30, 0.12), transparent 60deg);
  }
}
</style>
