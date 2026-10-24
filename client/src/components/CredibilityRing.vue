<template>
  <div
    class="ring"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="`可信度 ${Math.round(value * 100)} 分`"
  >
    <svg :width="size" :height="size" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" :r="radius" fill="none" stroke="#1f2933" :stroke-width="stroke" />
      <circle
        cx="22"
        cy="22"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        transform="rotate(-90 22 22)"
      />
    </svg>
    <span class="num mono" :style="{ color }">{{ Math.round(value * 100) }}</span>
  </div>
</template>

<script>
export default {
  name: 'CredibilityRing',
  props: {
    value: { type: Number, default: 0 },
    size: { type: Number, default: 44 },
    stroke: { type: Number, default: 3 }
  },
  computed: {
    radius() {
      return 22 - this.stroke
    },
    circumference() {
      return 2 * Math.PI * this.radius
    },
    offset() {
      const clamped = Math.min(1, Math.max(0, this.value))
      return this.circumference * (1 - clamped)
    },
    color() {
      if (this.value >= 0.85) return 'var(--verified)'
      if (this.value >= 0.65) return 'var(--signal)'
      return 'var(--muted)'
    }
  }
}
</script>

<style scoped>
.ring {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
}
.ring svg {
  position: absolute;
  inset: 0;
}
.num {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
}
</style>
