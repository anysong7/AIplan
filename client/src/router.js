import Vue from 'vue'
import VueRouter from 'vue-router'
import FeedView from './views/FeedView.vue'
import WatchView from './views/WatchView.vue'
import SettingsView from './views/SettingsView.vue'

Vue.use(VueRouter)

export default new VueRouter({
  mode: 'hash',
  routes: [
    { path: '/', name: 'feed', component: FeedView },
    { path: '/event/:id', name: 'event', component: FeedView },
    { path: '/watch', name: 'watch', component: WatchView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '*', redirect: '/' }
  ]
})
