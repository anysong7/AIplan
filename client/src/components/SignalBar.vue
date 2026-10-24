<template>
  <div class="signal" :aria-label="`热度 ${Math.round(heat * 100)}`" role="img">
    <span v-for="i in 5" :key="i" :class="{ on: heat * 5 >= i - 0.5 }" />
  </div>
</template>

<script>
export default {
  name: 'SignalBar',
  props: {
    heat: { type: Number, default: 0 }
  }
}
</script>

<style scoped>
.signal {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 3px;
}
.signal span {
  display: block;
  height: 7px;
  width: 3px;
  background: #232d37;
}
.signal span.on {
  background: var(--signal);
  box-shadow: 0 0 6px rgba(242, 176, 30, 0.5);
}
</style>
