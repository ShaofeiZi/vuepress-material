<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute, useRouter, withBase } from 'vitepress'
import PostCard from './PostCard.vue'
import Pagination from './Pagination.vue'

const props = defineProps({
  posts: { type: Array, default: () => [] }
})

const { frontmatter, theme } = useData()
const route = useRoute()
const router = useRouter()
const pageSize = computed(() => Number(frontmatter.value.pageSize) || Number(theme.value.pagination?.pageSize) || 5)
const pageFromPath = () => Math.max(1, Number(String(route.path).match(/\/page\/(\d+)/)?.[1]) || 1)
const pageFromFrontmatter = () => Number(frontmatter.value.page) || 0
const currentPage = ref(Math.max(1, pageFromFrontmatter() || pageFromPath()))
const totalPages = computed(() => Math.max(1, Math.ceil(props.posts.length / pageSize.value)))
const pagePosts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return props.posts.slice(start, start + pageSize.value)
})

function readLocation() {
  const requested = Number(frontmatter.value.page)
    || Number(new URLSearchParams(window.location.search).get('page'))
    || pageFromPath()
  currentPage.value = Math.min(Math.max(1, requested), totalPages.value)
}

function changePage(page) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
  const url = currentPage.value === 1 ? withBase('/') : withBase(`/page/${currentPage.value}.html`)
  router.go(url)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(totalPages, total => {
  if (currentPage.value > total) currentPage.value = total
})
watch(
  [() => route.path, () => frontmatter.value.page],
  () => {
    const requested = Number(frontmatter.value.page) || pageFromPath()
    currentPage.value = Math.min(Math.max(1, requested), totalPages.value)
  }
)
onMounted(() => {
  readLocation()
  window.addEventListener('popstate', readLocation)
})
onBeforeUnmount(() => window.removeEventListener('popstate', readLocation))
</script>

<template>
  <section class="content-container home-view" aria-label="文章列表">
    <div class="post-grid" aria-live="polite">
      <PostCard v-for="post in pagePosts" :key="post.url" :post="post" />
      <div v-if="!pagePosts.length" class="material-card empty-state">暂时还没有文章。</div>
    </div>
    <Pagination :current="currentPage" :total="totalPages" @change="changePage" />
  </section>
</template>
