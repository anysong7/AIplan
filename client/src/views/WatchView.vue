<template>
  <div class="watch">
    <header class="head">
      <div>
        <span class="label">Watchlist</span>
        <h1>关键词哨兵</h1>
        <p class="sub">命中关键词且通过可信度门控时，页面弹窗与邮件会同时提醒。</p>
      </div>
      <button class="btn btn-ghost" type="button" :disabled="scan.running" @click="scanAll">
        <Icon name="refresh" /> {{ scan.running ? '扫描中…' : '扫描全部' }}
      </button>
    </header>

    <form class="form" @submit.prevent="submit">
      <div class="row">
        <label class="field-wrap grow">
          <span class="label">关键词 *</span>
          <input v-model.trim="form.keyword" class="field" placeholder="例如：GPT-5、Claude Code、AI 编程" />
        </label>
        <label class="field-wrap grow">
          <span class="label">别名（逗号分隔）</span>
          <input v-model.trim="form.aliases" class="field" placeholder="gpt5, 聊天机器人" />
        </label>
      </div>
      <div class="row">
        <label class="field-wrap grow">
          <span class="label">排除词（逗号分隔）</span>
          <input v-model.trim="form.excludeTerms" class="field" placeholder="招聘, 课程, 广告" />
        </label>
        <label class="field-wrap">
          <span class="label">可信度门槛</span>
          <select v-model.number="form.minCredibility" class="field">
            <option :value="0.65">65 · 严格</option>
            <option :value="0.55">55 · 平衡</option>
            <option :value="0.45">45 · 宽松</option>
          </select>
        </label>
        <button class="btn btn-primary submit" type="submit" :disabled="submitting">
          <Icon name="plus" /> {{ submitting ? '添加中…' : '添加监控' }}
        </button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="hint" class="hint">{{ hint }}</p>
    </form>

    <div class="list">
      <article v-for="watch in watches" :key="watch.id" class="item" :class="{ off: !watch.enabled }">
        <div class="item-main">
          <div class="item-top">
            <h2>{{ watch.keyword }}</h2>
            <span class="chip mono">≥ {{ Math.round(watch.min_credibility * 100) }}</span>
            <span v-if="watch.unread" class="chip unread mono">{{ watch.unread }} 未读</span>
            <span v-else class="chip mono">{{ watch.hits }} 命中</span>
          </div>
          <p class="aliases">
            <span v-if="watch.aliases.length">别名：{{ watch.aliases.join(' / ') }}</span>
            <span v-else>无别名</span>
            <span v-if="watch.exclude_terms.length"> · 排除：{{ watch.exclude_terms.join(' / ') }}</span>
          </p>
          <p class="meta mono">
            EVERY {{ Math.round(watch.interval_sec / 60) }} MIN · LAST
            {{ watch.last_scan_at ? timeAgo(watch.last_scan_at) : '未扫描' }} ·
            {{ watch.channels.join(' + ') }}
          </p>
        </div>
        <div class="item-actions">
          <button class="btn btn-ghost" type="button" @click="scanOne(watch)">扫描</button>
          <button class="btn btn-ghost" type="button" @click="toggle(watch)">
            {{ watch.enabled ? '停用' : '启用' }}
          </button>
          <button class="btn btn-danger" type="button" @click="remove(watch)">删除</button>
        </div>
      </article>

      <EmptyState
        v-if="!watches.length"
        title="还没有关键词"
        text="添加第一个关键词。例如「GPT-5」，别名填「gpt5」。"
      />
    </div>
  </div>
</template>

<script>
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { store } from '../store.js'
import { timeAgo } from '../utils.js'

export default {
  name: 'WatchView',
  components: { Icon, EmptyState },
  data() {
    return {
      form: { keyword: '', aliases: '', excludeTerms: '', minCredibility: 0.65 },
      submitting: false,
      error: '',
      hint: ''
    }
  },
  computed: {
    watches() {
      return store.state.watches
    },
    scan() {
      return store.state.scan
    }
  },
  methods: {
    timeAgo,
    async submit() {
      this.error = ''
      this.hint = ''
      if (!this.form.keyword) {
        this.error = '关键词不能为空'
        return
      }
      this.submitting = true
      try {
        await store.addWatch({
          keyword: this.form.keyword,
          aliases: this.form.aliases,
          excludeTerms: this.form.excludeTerms,
          minCredibility: this.form.minCredibility
        })
        this.hint = `已添加「${this.form.keyword}」，并回填了最近的命中。`
        this.form.keyword = ''
        this.form.aliases = ''
        this.form.excludeTerms = ''
      } catch (err) {
        this.error = err.message
      } finally {
        this.submitting = false
      }
    },
    async toggle(watch) {
      try {
        await store.updateWatch(watch.id, { enabled: !watch.enabled })
      } catch (err) {
        this.error = err.message
      }
    },
    async remove(watch) {
      if (!window.confirm(`删除监控「${watch.keyword}」？`)) return
      try {
        await store.removeWatch(watch.id)
      } catch (err) {
        this.error = err.message
      }
    },
    scanOne(watch) {
      store.scan(`watch:${watch.id}`)
    },
    scanAll() {
      store.scan('all')
    }
  }
}
</script>

<style scoped>
.watch {
  display: grid;
  gap: var(--s5);
  align-content: start;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s3);
}
h1 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  margin-top: 2px;
}
.sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}
.form {
  padding: var(--s4);
  border: 1px solid var(--line);
  background: var(--panel);
  display: grid;
  gap: var(--s3);
}
.row {
  display: flex;
  gap: var(--s3);
  align-items: end;
  flex-wrap: wrap;
}
.field-wrap {
  display: grid;
  gap: 3px;
  min-width: 180px;
}
.grow {
  flex: 1;
}
.field-wrap .field {
  min-height: 36px;
}
.submit {
  min-height: 36px;
}
.error {
  color: var(--danger);
  font-size: 12px;
}
.hint {
  color: var(--verified);
  font-size: 12px;
}
.list {
  display: grid;
  gap: 10px;
}
.item {
  display: flex;
  gap: var(--s4);
  justify-content: space-between;
  padding: var(--s4);
  border: 1px solid var(--line);
  background: var(--panel);
}
.item.off {
  opacity: 0.55;
}
.item-main {
  min-width: 0;
}
.item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.item-top h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
}
.chip.unread {
  color: var(--signal);
  border-color: var(--signal-dim);
}
.aliases {
  margin-top: 4px;
  font-size: 12px;
  color: var(--paper-dim);
}
.meta {
  margin-top: 8px;
  font-size: 9px;
  color: var(--muted-2);
  letter-spacing: 0.06em;
}
.item-actions {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.item-actions .btn {
  min-height: 32px;
  font-size: 12px;
  padding: 0 10px;
}
@media (max-width: 768px) {
  .item {
    flex-direction: column;
  }
  .item-actions {
    justify-content: flex-start;
  }
  .head {
    flex-direction: column;
  }
}
</style>

