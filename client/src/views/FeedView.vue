<template>
  <div class="feed">
    <div class="feed-head">
      <div class="tabs" role="tablist" aria-label="热点范围">
        <button
          class="tab"
          :class="{ on: filters.topic === '' }"
          type="button"
          role="tab"
          :aria-selected="filters.topic === ''"
          @click="setTopic('')"
        >
          全部
        </button>
        <button
          v-for="topic in topics"
          :key="topic.id"
          class="tab"
          :class="{ on: filters.topic === topic.name }"
          type="button"
          role="tab"
          :aria-selected="filters.topic === topic.name"
          @click="setTopic(topic.name)"
        >
          {{ topic.name }}
        </button>
      </div>
      <button class="btn btn-ghost read" type="button" @click="markAll">
        <Icon name="check" /> 全部已读
      </button>
    </div>

    <div class="filters">
      <label class="filter">
        <span class="label">Since</span>
        <select class="field" :value="filters.since" @change="setFilter({ since: $event.target.value })">
          <option value="24h">24 小时</option>
          <option value="72h">3 天</option>
          <option value="168h">7 天</option>
        </select>
      </label>
      <label class="filter">
        <span class="label">Credibility</span>
        <select
          class="field"
          :value="filters.minCredibility"
          @change="setFilter({ minCredibility: Number($event.target.value) })"
        >
          <option :value="0">全部</option>
          <option :value="0.65">≥ 65</option>
          <option :value="0.75">≥ 75</option>
          <option :value="0.85">≥ 85</option>
        </select>
      </label>
      <label class="filter">
        <span class="label">Platform</span>
        <select class="field" :value="filters.platform" @change="setFilter({ platform: $event.target.value })">
          <option value="">全部</option>
          <option value="web">Web</option>
          <option value="x">X</option>
        </select>
      </label>
      <span class="count mono">{{ total }} EVENTS</span>
    </div>

    <div v-if="scan.running" class="scan-note mono">
      SCANNING · {{ scan.phase }} · {{ scan.processed }}/{{ scan.total }}
    </div>

    <div v-if="loading" class="list" aria-busy="true">
      <div v-for="i in 4" :key="i" class="skeleton card-skeleton" />
    </div>

    <div v-else-if="events.length" class="list">
      <HotspotCard
        v-for="event in events"
        :key="event.id"
        :event="event"
        :selected="selectedId === event.id"
        @open="open"
      />
    </div>

    <EmptyState
      v-else
      title="还没有值得推送的热点"
      text="点右上角「立即扫描」，或先去监控页添加一个关键词。当前筛选条件下没有事件。"
    >
      <button class="btn btn-primary" type="button" @click="$emit('scan')">
        <Icon name="radar" /> 立即扫描
      </button>
    </EmptyState>

    <div v-if="unverifiedCount" class="unverified mono">
      观察区：{{ unverifiedCount }} 条未证实内容（不推送，仅在此可见）
    </div>
  </div>
</template>

<script>
import HotspotCard from '../components/HotspotCard.vue'
import EmptyState from '../components/EmptyState.vue'
import Icon from '../components/Icon.vue'
import { store } from '../store.js'

export default {
  name: 'FeedView',
  components: { HotspotCard, EmptyState, Icon },
  computed: {
    state() {
      return store.state
    },
    events() {
      return this.state.events
    },
    topics() {
      return this.state.topics.filter((t) => t.enabled)
    },
    filters() {
      return this.state.filters
    },
    total() {
      return this.state.total
    },
    loading() {
      return this.state.loadingEvents && !this.state.events.length
    },
    scan() {
      return this.state.scan
    },
    selectedId() {
      return this.state.selectedId
    },
    unverifiedCount() {
      return this.state.events.filter((e) => e.verdict === 'unverified').length
    }
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler(id) {
        if (id) store.selectEvent(id)
        else store.closeDetail()
      }
    }
  },
  methods: {
    setTopic(name) {
      store.setFilter({ topic: name })
    },
    setFilter(patch) {
      store.setFilter(patch)
    },
    open(id) {
      this.$router.push(`/event/${id}`)
    },
    async markAll() {
      await store.readAll()
      store.pushToast({ title: '已全部标记为已读', verdict: 'verified', score: 1 })
    }
  }
}
</script>

<style scoped>
.feed {
  display: grid;
  gap: var(--s4);
  align-content: start;
}
.feed-head {
  display: flex;
  align-items: center;
  gap: var(--s3);
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}
.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  border-bottom: 1px solid transparent;
  white-space: nowrap;
}
.tab:hover {
  color: var(--paper);
}
.tab.on {
  color: var(--signal);
  border-bottom-color: var(--signal);
}
.read {
  margin-left: auto;
  white-space: nowrap;
}
.filters {
  display: flex;
  align-items: end;
  gap: var(--s3);
  flex-wrap: wrap;
}
.filter {
  display: grid;
  gap: 3px;
}
.filter .field {
  min-height: 32px;
  width: auto;
  min-width: 92px;
  font-size: 12px;
  background: #0c1116;
}
.count {
  margin-left: auto;
  font-size: 9px;
  color: var(--muted-2);
  letter-spacing: 0.12em;
}
.scan-note {
  padding: 6px 10px;
  border: 1px solid var(--signal-dim);
  color: var(--signal);
  font-size: 10px;
  background: rgba(242, 176, 30, 0.05);
}
.list {
  display: grid;
  gap: 10px;
}
.card-skeleton {
  height: 128px;
}
.unverified {
  margin-top: 6px;
  padding: 10px;
  border: 1px dashed var(--line-strong);
  color: var(--muted-2);
  font-size: 9px;
  letter-spacing: 0.06em;
}
@media (max-width: 768px) {
  .feed-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .read {
    display: none;
  }
  .count {
    display: none;
  }
  .filter {
    flex: 1;
  }
  .filter .field {
    width: 100%;
  }
}
</style>

