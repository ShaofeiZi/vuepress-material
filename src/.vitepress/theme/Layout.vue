<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import { data as posts } from '../posts.data.mjs'
import AppHeader from './components/AppHeader.vue'
import SideNav from './components/SideNav.vue'
import HomeView from './components/HomeView.vue'
import TagsView from './components/TagsView.vue'
import ArticleView from './components/ArticleView.vue'
import AboutView from './components/AboutView.vue'
import NotFoundView from './components/NotFoundView.vue'
import AppFooter from './components/AppFooter.vue'
import BackToTop from './components/BackToTop.vue'
import { findPost, normalizePath } from './utils.js'

const data = useData()
const route = useRoute()
const isMobile = ref(false)
const navOpen = ref(true)
const navCompact = ref(false)
const routeChanging = ref(false)
let progressTimer

const siteBase = computed(() => data.site.value.base || '/')
const path = computed(() => normalizePath(route.path, siteBase.value))
const layoutName = computed(() => String(data.frontmatter.value.layout || '').toLowerCase())
const currentPost = computed(() => findPost(posts, route.path, siteBase.value))
const isNotFound = computed(() => Boolean(data.page.value.isNotFound))

const view = computed(() => {
  if (isNotFound.value) return 'not-found'
  if (layoutName.value === 'home' || path.value === '/' || /^\/page\/\d+$/.test(path.value)) return 'home'
  if (layoutName.value === 'tags' || path.value === '/tags' || path.value.startsWith('/tags/')) return 'tags'
  if (layoutName.value === 'about' || path.value === '/about') return 'about'
  return 'article'
})

const headerTitle = computed(() => {
  if (view.value === 'home') return data.site.value.title
  return data.frontmatter.value.title || data.page.value.title || data.site.value.title
})

function updateViewport(initial = false) {
  const next = window.innerWidth < 960
  if (initial || next !== isMobile.value) {
    isMobile.value = next
    navOpen.value = !next
    if (next) navCompact.value = false
  }
}

function toggleNav() {
  if (isMobile.value) navOpen.value = !navOpen.value
  else navCompact.value = !navCompact.value
}

function closeMobileNav() {
  if (isMobile.value) navOpen.value = false
}

onMounted(() => {
  updateViewport(true)
  window.addEventListener('resize', updateViewport, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.clearTimeout(progressTimer)
})

watch(
  () => route.path,
  () => {
    closeMobileNav()
    routeChanging.value = true
    window.clearTimeout(progressTimer)
    progressTimer = window.setTimeout(() => {
      routeChanging.value = false
    }, 260)
  }
)
</script>

<template>
  <div
    class="material-blog"
    :class="{ 'nav-compact': navCompact && !isMobile, 'is-mobile': isMobile }"
  >
    <div v-if="routeChanging" class="route-progress" aria-hidden="true" />

    <SideNav
      :open="navOpen"
      :compact="navCompact && !isMobile"
      @navigate="closeMobileNav"
    />
    <button
      v-if="isMobile && navOpen"
      class="nav-scrim"
      type="button"
      aria-label="关闭导航"
      @click="navOpen = false"
    />

    <div class="shell-body">
      <AppHeader :title="headerTitle" :posts="posts" @toggle-nav="toggleNav" />

      <main id="main-content" class="site-main">
        <HomeView v-if="view === 'home'" :posts="posts" />
        <TagsView v-else-if="view === 'tags'" :posts="posts" />
        <AboutView v-else-if="view === 'about'" />
        <NotFoundView v-else-if="view === 'not-found'" />
        <ArticleView v-else :post="currentPost" :posts="posts" />
      </main>

      <AppFooter />
    </div>

    <BackToTop />
  </div>
</template>
