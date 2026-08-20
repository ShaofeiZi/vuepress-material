<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useData, useRoute } from 'vitepress'
import Icon from './Icon.vue'
import { plainText } from '../utils.js'

const { frontmatter, page, site, theme } = useData()
const route = useRoute()
const root = ref(null)
const open = ref(false)
const copied = ref(false)
let copiedTimer

const title = computed(() => frontmatter.value.title || page.value.title || site.value.title)
const summary = computed(() => plainText(frontmatter.value.description || page.value.description || site.value.description || ''))
const configured = computed(() => {
  const list = theme.value.socials
  return Array.isArray(list) && list.length ? list.map(item => String(item).toLowerCase()) : ['weibo', 'qq']
})

const shares = computed(() => {
  if (typeof window === 'undefined') return []
  // Keep the current URL reactive even when two pages share title/description.
  void route.path
  const url = encodeURIComponent(window.location.href.split('#')[0])
  const text = encodeURIComponent(title.value)
  const description = encodeURIComponent(summary.value)
  const items = []
  if (configured.value.includes('weibo')) {
    items.push({ name: '微博', icon: 'weibo', href: `https://service.weibo.com/share/share.php?url=${url}&title=${text}` })
  }
  if (configured.value.includes('qq')) {
    items.push({ name: 'QQ', icon: 'qq', href: `https://connect.qq.com/widget/shareqq/index.html?url=${url}&title=${text}&summary=${description}` })
  }
  return items
})

async function copyLink() {
  const value = window.location.href
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
  copied.value = true
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
    open.value = false
  }, 900)
}

function onDocumentPointerDown(event) {
  if (!root.value?.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.clearTimeout(copiedTimer)
})
</script>

<template>
  <div ref="root" class="share-menu">
    <button
      class="icon-button"
      type="button"
      aria-label="分享当前页面"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="share" />
    </button>
    <div v-if="open" class="share-popover">
      <a
        v-for="item in shares"
        :key="item.name"
        :href="item.href"
        target="_blank"
        rel="noopener noreferrer"
        @click="open = false"
      >
        <Icon :name="item.icon" size="21" />
        <span>{{ item.name }}</span>
      </a>
      <button type="button" @click="copyLink">
        <Icon name="copy" size="21" />
        <span>{{ copied ? '已复制' : '复制链接' }}</span>
      </button>
    </div>
  </div>
</template>
