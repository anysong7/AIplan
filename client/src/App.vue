<template>
  <div class="shell">
    <header class="topbar">
      <router-link to="/" class="brand" aria-label="SIGNAL 首页">
        <span class="mark mono">SIGNAL</span>
        <span class="cn">信号雷达</span>
      </router-link>

      <label class="search">
        <Icon name="search" />
        <input
          ref="search"
          v-model.trim="q"
          type="search"
          placeholder="搜索热点 / 关键词"
          aria-label="搜索热点"
        />
        <kbd class="mono">/</kbd>
      </label>

      <div class="actions">
        <span
          class="conn mono"
          :class="stream"
          :title="stream === 'open' ? '实时连接正常' : '实时连接中断'"
        >
          <i />
          {{ stream === 'open' ? 'LIVE' : 'LINK' }}
        </span>
        <button class="btn btn-primary scan-btn" type="button" :disabled="scan.running" @click="runScan" aria-label="立即扫描">
          <Icon name="radar" />
          <span class="scan-text">{{ scan.running ? '扫描中' : '立即扫描' }}</span>
        </button>
        <button class="iconbtn" type="button" aria-label="全部标记为已读" @click="readAll">
          <Icon name="bell" />
          <span v-if="unread" class="badge mono">{{ unread > 99 ? '99+' : unread }}</span>
        </button>
        <router-link to="/settings" class="iconbtn" aria-label="设置">
          <Icon name="settings" />
        </router-link>
      </div>
    </header>

    <ScanBar :active="scan.running" />

    <div class="layout">
      <aside class="rail" aria-label="监控概览">
        <RadarDial :count="todayCount" :scanning="scan.running" @scan="runScan" />

        <section class="rail-block">
          <div class="rail-head">
            <span class="label">Watchlist</span>
            <router-link to="/watch" class="more mono">管理</router-link>
          </div>
          <router-link
            v-for="watch in watches.slice(0, 5)"
            :key="watch.id"
            to="/watch"
            class="watch-line"
          >
            <span class="kw">{{ watch.keyword }}</span>
            <span v-if="watch.unread" class="count mono">{{ watch.unread }}</span>
            <span v-else class="count mono dim">{{ watch.hits }}</span>
          </router-link>
          <p v-if="!watches.length" class="empty-line">
            还没有关键词，
            <router-link to="/watch">去添加</router-link>
          </p>
        </section>

        <section class="rail-block">
          <SourceHealth :sources="sources" />
        </section>

        <div class="rail-foot mono">
          <span>{{ status?.counts?.events || 0 }} EVENTS</span>
          <span>{{ status?.verifyMode || 'rules' }}</span>
        </div>
      </aside>

      <main class="main">
        <router-view @scan="runScan" />
      </main>
    </div>

    <nav class="mobile-nav" aria-label="主导航">
      <router-link to="/" exact class="mnav">
        <Icon name="radar" />
        <span>热点</span>
      </router-link>
      <router-link to="/watch" class="mnav">
        <Icon name="bell" />
        <span>监控</span>
      </router-link>
      <router-link to="/settings" class="mnav">
        <Icon name="settings" />
        <span>设置</span>
      </router-link>
    </nav>

    <DetailDrawer :detail="detail" :loading="detailLoading" @close="closeDetail" />
    <ToastStack @open="openEvent" />
    <AlertModal :payload="modal" @close="dismissModal" @open="openEvent" />
  </div>
</template>

<script>
import Icon from './components/Icon.vue'
import ScanBar from './components/ScanBar.vue'
import RadarDial from './components/RadarDial.vue'
import SourceHealth from './components/SourceHealth.vue'
import ToastStack from './components/ToastStack.vue'
import AlertModal from './components/AlertModal.vue'
import DetailDrawer from './components/DetailDrawer.vue'
import { store } from './store.js'
import { connectStream } from './api.js'

export default {
  name: 'App',
  components: {
    Icon,
    ScanBar,
    RadarDial,
    SourceHealth,
    ToastStack,
    AlertModal,
    DetailDrawer
  },
  data() {
    return { q: '', searchTimer: null }
  },
  computed: {
    state() {
      return store.state
    },
    status() {
      return this.state.status
    },
    watches() {
      return this.state.watches
    },
    sources() {
      return this.state.sources
    },
    scan() {
      return this.state.scan
    },
    stream() {
      return this.state.stream
    },
    unread() {
      return this.state.unread
    },
    modal() {
      return this.state.modal
    },
    detail() {
      return this.state.detail
    },
    detailLoading() {
      return this.state.detailLoading
    },
    todayCount() {
      return this.status?.counts?.events24h || 0
    }
  },
  watch: {
    unread(value) {
      document.title = value ? `(${value}) SIGNAL · 信号雷达` : 'SIGNAL · 信号雷达'
    },
    q(value) {
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => {
        store.setFilter({ q: value })
      }, 320)
    }
  },
  async mounted() {
    await store.init()
    this.streamSource = connectStream({
      onEvent: (name, payload) => store.handleStreamEvent(name, payload),
      onStatus: (status) => store.setStream(status === 'open' ? 'open' : 'error')
    })
    window.addEventListener('keydown', this.onKey)
  },
  beforeDestroy() {
    this.streamSource?.close()
    window.removeEventListener('keydown', this.onKey)
    clearTimeout(this.searchTimer)
  },
  methods: {
    async runScan() {
      await store.scan('all')
      if (this.scan.errors?.length) {
        store.pushToast({
          title: '扫描部分失败',
          summary: this.scan.errors[0],
          verdict: 'suspicious',
          score: 0
        })
      }
    },
    openEvent(id) {
      this.dismissModal()
      this.$router.push(`/event/${id}`).catch(() => {})
    },
    closeDetail() {
      store.closeDetail()
      if (this.$route.params.id) this.$router.push('/').catch(() => {})
    },
    dismissModal() {
      store.dismissModal()
    },
    async readAll() {
      await store.readAll()
      store.pushToast({ title: '已全部标记为已读', verdict: 'verified', score: 1 })
    },
    onKey(event) {
      const tag = (event.target?.tagName || '').toLowerCase()
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select'
      if (event.key === '/' && !editing) {
        event.preventDefault()
        this.$refs.search?.focus()
      }
      if (event.key === 'Escape' && editing) this.$refs.search?.blur()
      if (event.key === 's' && !editing) {
        event.preventDefault()
        this.runScan()
      }
      if (event.key === 'r' && !editing) this.readAll()
    }
  }
}
</script>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  height: var(--topbar-h);
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 0 18px;
  background: rgba(10, 12, 15, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: var(--paper);
  text-decoration: none;
}
.brand:hover {
  text-decoration: none;
}
.mark {
  font-size: 18px;
  letter-spacing: 0.22em;
  font-weight: 700;
}
.cn {
  font-size: 10px;
  color: var(--muted-2);
  letter-spacing: 0.2em;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 520px;
  justify-self: center;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  background: #0d1217;
  border-radius: var(--radius);
}
.search .icon {
  width: 14px;
  height: 14px;
  color: var(--muted-2);
}
.search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  font-size: 12.5px;
}
.search kbd {
  font-size: 9px;
  color: var(--muted-2);
  border: 1px solid var(--line);
  padding: 0 5px;
  border-radius: 2px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.conn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--muted-2);
}
.conn i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
}
.conn.open i {
  background: var(--verified);
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
}
.conn.error i {
  background: var(--danger);
}
.iconbtn {
  position: relative;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--paper-dim);
}
.iconbtn:hover {
  border-color: var(--line);
  background: var(--panel);
  color: var(--paper);
}
.badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--signal);
  color: #17130a;
  font-size: 9px;
  letter-spacing: 0;
}
.layout {
  flex: 1;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 18px;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
}
.rail {
  display: grid;
  gap: 20px;
  align-content: start;
  padding: 22px 18px 40px 0;
  border-right: 1px solid var(--line);
}
.rail-block {
  display: grid;
  gap: 8px;
}
.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
.more {
  font-size: 9px;
  color: var(--muted-2);
}
.watch-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  color: var(--paper-dim);
  font-size: 12px;
  text-decoration: none;
}
.watch-line:hover {
  color: var(--signal);
  text-decoration: none;
}
.count {
  font-size: 10px;
  color: var(--signal);
}
.count.dim {
  color: var(--muted-2);
}
.empty-line {
  font-size: 11px;
  color: var(--muted-2);
}
.rail-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 9px;
  color: var(--muted-2);
}
.main {
  min-width: 0;
  padding: 22px 0 64px 24px;
}
.mobile-nav {
  display: none;
}
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .rail {
    display: none;
  }
  .main {
    padding: 18px 0 84px;
  }
}
@media (max-width: 768px) {
  .topbar {
    height: auto;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'brand actions'
      'search search';
    row-gap: 8px;
    padding: 8px 12px;
    gap: 0 8px;
  }
  .brand {
    grid-area: brand;
  }
  .actions {
    grid-area: actions;
    justify-self: end;
  }
  .search {
    grid-area: search;
    max-width: none;
    justify-self: stretch;
    height: 32px;
    padding: 0 8px;
  }
  .brand .cn,
  .conn,
  .search kbd {
    display: none;
  }
  .mark {
    font-size: 15px;
    letter-spacing: 0.16em;
  }
  .scan-btn {
    width: 36px;
    min-height: 34px;
    padding: 0;
    gap: 0;
    font-size: 0;
  }
  .scan-btn .icon {
    width: 16px;
    height: 16px;
  }
  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: rgba(10, 12, 15, 0.96);
    border-top: 1px solid var(--line);
  }
  .mnav {
    display: grid;
    place-items: center;
    gap: 2px;
    color: var(--muted);
    font-size: 10px;
    text-decoration: none;
  }
  .mnav .icon {
    width: 18px;
    height: 18px;
  }
  .mnav.router-link-active {
    color: var(--signal);
  }
}
</style>


