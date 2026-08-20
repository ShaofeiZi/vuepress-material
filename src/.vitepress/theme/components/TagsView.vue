<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute, useRouter, withBase } from 'vitepress'
import Icon from './Icon.vue'
import TagChip from './TagChip.vue'
import { formatDate, normalizePath, tagHref } from '../utils.js'

const props = defineProps({
  posts: { type: Array, default: () => [] }
})

const { frontmatter, site } = useData()
const route = useRoute()
const router = useRouter()
const selected = ref(String(frontmatter.value.tag || ''))

const tags = computed(() => {
  const counts = new Map()
  props.posts.forEach(post => {
    ;(post.tags || []).forEach(tag => counts.set(String(tag), (counts.get(String(tag)) || 0) + 1))
  })
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const selectedPosts = computed(() => {
  if (!selected.value) return []
  return props.posts.filter(post => (post.tags || []).some(tag => String(tag) === selected.value))
})

function tagFromPath() {
  const path = normalizePath(route.path, site.value.base || '/')
  const match = path.match(/^\/tags\/([^/]+)/)
  if (!match) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function readLocation() {
  selected.value = String(frontmatter.value.tag || '')
    || new URLSearchParams(window.location.search).get('tag')
    || tagFromPath()
}

function selectTag(tag, event) {
  event?.preventDefault()
  selected.value = tag
  window.history.pushState({}, '', tagHref(tag, withBase))
}

function clearTag() {
  selected.value = ''
  router.go(withBase('/tags/'))
}

watch(
  [() => route.path, () => frontmatter.value.tag],
  () => { selected.value = String(frontmatter.value.tag || '') || tagFromPath() }
)
onMounted(() => {
  readLocation()
  window.addEventListener('popstate', readLocation)
})
onBeforeUnmount(() => window.removeEventListener('popstate', readLocation))
</script>

<template>
  <section class="content-container tags-view">
    <div class="material-card tags-card">
      <div class="section-heading">
        <Icon name="tag" />
        <div><h1>标签</h1><p>按主题浏览全部文章</p></div>
      </div>
      <div class="tag-cloud">
        <TagChip
          v-for="item in tags"
          :key="item.name"
          :tag="item.name"
          :count="item.count"
          :active="item.name === selected"
          @select="event => selectTag(item.name, event)"
        />
      </div>
    </div>

    <div v-if="selected" class="material-card tag-results">
      <div class="tag-result-title">
        <h2>#{{ selected }} <small>{{ selectedPosts.length }} 篇</small></h2>
        <button type="button" @click="clearTag">查看全部标签</button>
      </div>
      <a v-for="post in selectedPosts" :key="post.url" class="tag-post-row" :href="withBase(post.url)">
        <time :datetime="post.date">{{ formatDate(post.date) }}</time>
        <span>{{ post.title }}</span>
        <Icon name="chevron-right" size="20" />
      </a>
      <div v-if="!selectedPosts.length" class="empty-state">这个标签下暂时没有文章。</div>
    </div>
    <div v-else class="tag-hint">选择一个标签查看相关文章</div>
  </section>
</template>
