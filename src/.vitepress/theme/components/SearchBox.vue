<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, withBase } from 'vitepress'
import Icon from './Icon.vue'
import { plainText } from '../utils.js'

const props = defineProps({
  posts: { type: Array, default: () => [] }
})

const router = useRouter()
const root = ref(null)
const input = ref(null)
const query = ref('')
const open = ref(false)
const activeIndex = ref(0)

const results = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return []

  const found = []
  for (const post of props.posts) {
    const haystack = [post.title, post.description, plainText(post.excerpt), ...(post.tags || [])]
      .join(' ')
      .toLocaleLowerCase()
    if (haystack.includes(needle)) {
      found.push({ title: post.title, url: post.url, detail: post.description || (post.tags || []).join(' · ') })
    } else {
      const header = (post.headers || []).find(item => String(item.title || '').toLocaleLowerCase().includes(needle))
      if (header) {
        found.push({
          title: post.title,
          url: `${post.url}#${header.slug}`,
          detail: `› ${header.title}`
        })
      }
    }
    if (found.length === 6) break
  }
  return found
})

const expanded = computed(() => open.value && query.value.trim().length > 0)

function show() {
  open.value = true
}

async function activateSearch() {
  open.value = true
  await nextTick()
  input.value?.focus()
}

function move(delta) {
  if (!results.value.length) return
  activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length
}

function select(result = results.value[activeIndex.value]) {
  if (!result) return
  query.value = ''
  open.value = false
  router.go(withBase(result.url))
}

function close() {
  open.value = false
}

function onDocumentPointerDown(event) {
  if (!root.value?.contains(event.target)) close()
}

watch(query, () => {
  activeIndex.value = 0
})

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="search-box" :class="{ open }">
    <button class="icon-button search-trigger" type="button" aria-label="搜索文章" @click="activateSearch">
      <Icon name="search" />
    </button>
    <div class="search-field">
      <Icon name="search" size="19" />
      <input
        ref="input"
        v-model="query"
        type="search"
        placeholder="搜索文章"
        aria-label="搜索文章"
        aria-autocomplete="list"
        :aria-expanded="expanded"
        autocomplete="off"
        spellcheck="false"
        @focus="show"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="select()"
        @keydown.esc="close"
      >
    </div>

    <div v-if="expanded" class="search-results" role="listbox">
      <a
        v-for="(result, index) in results"
        :key="result.url"
        class="search-result"
        :class="{ active: index === activeIndex }"
        :href="withBase(result.url)"
        role="option"
        :aria-selected="index === activeIndex"
        @mouseenter="activeIndex = index"
        @mousedown.prevent
        @click.prevent="select(result)"
      >
        <span>{{ result.title }}</span>
        <small v-if="result.detail">{{ plainText(result.detail).slice(0, 72) }}</small>
      </a>
      <div v-if="!results.length" class="search-empty">没有找到“{{ query.trim() }}”</div>
    </div>
  </div>
</template>
