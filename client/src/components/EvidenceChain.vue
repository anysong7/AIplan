<template>
  <div class="chain">
    <div class="head">
      <span class="label">Evidence</span>
      <span class="mono">{{ independent }} independent</span>
    </div>
    <div v-for="group in groups" :key="group.key" class="group">
      <div class="group-title mono">{{ group.label }}</div>
      <ul>
        <li v-for="item in group.items" :key="item.canonical_url">
          <a :href="item.canonical_url" target="_blank" rel="noopener noreferrer">
            <span class="domain mono">{{ item.domain }}</span>
            <span class="title">{{ item.title }}</span>
          </a>
          <span class="meta mono">{{ item.platform === 'x' ? 'X' : item.source_name }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EvidenceChain',
  props: {
    items: { type: Array, default: () => [] }
  },
  computed: {
    independent() {
      const set = new Set()
      for (const item of this.items) {
        if (item.domain === 'x.com' || item.domain === 'twitter.com') continue
        set.add(item.domain)
      }
      return set.size
    },
    groups() {
      const official = this.items.filter((i) => i.is_first_party)
      const social = this.items.filter((i) => i.platform === 'x' && !i.is_first_party)
      const media = this.items.filter((i) => !i.is_first_party && i.platform !== 'x')
      const list = []
      if (official.length) list.push({ key: 'official', label: '一手来源', items: official })
      if (media.length) list.push({ key: 'media', label: '媒体 / 社区', items: media })
      if (social.length) list.push({ key: 'social', label: '社交传播', items: social })
      return list
    }
  }
}
</script>

<style scoped>
.chain {
  border-top: 1px solid var(--line);
  padding-top: var(--s4);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--s3);
}
.head .mono {
  font-size: 9px;
  color: var(--muted-2);
}
.group {
  margin-bottom: var(--s4);
}
.group-title {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--signal-dim);
  margin-bottom: 6px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: baseline;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
li a {
  display: grid;
  gap: 2px;
  color: var(--paper);
  min-width: 0;
}
li a:hover {
  text-decoration: none;
}
li a:hover .title {
  color: var(--signal);
}
.domain {
  font-size: 9px;
  color: var(--muted-2);
}
.title {
  font-size: 12.5px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.meta {
  font-size: 9px;
  color: var(--muted-2);
  white-space: nowrap;
}
</style>
