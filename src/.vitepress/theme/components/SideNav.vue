<script setup>
import { computed, ref, watch } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import Icon from './Icon.vue'
import { iconForMenu, isExternalLink, normalizePath } from '../utils.js'

defineProps({
  open: Boolean,
  compact: Boolean
})

defineEmits(['navigate'])

const { site, theme } = useData()
const route = useRoute()
const avatarFailed = ref(false)

const defaults = [
  { text: '首页', url: '/', icon: 'home' },
  { text: '标签', url: '/tags/', icon: 'tag' },
  { text: 'Github', url: 'https://github.com/ShaofeiZi', icon: 'github', external: true },
  { text: 'About', url: '/about/', icon: 'user' }
]

const menus = computed(() => {
  const configured = theme.value.menus || theme.value.nav
  return Array.isArray(configured) && configured.length
    ? configured.filter(item => !item.items).map(item => ({ ...item, url: item.url || item.link }))
    : defaults
})

const avatar = computed(() => theme.value.avatar || '/face.png')
const avatarHref = computed(() => {
  if (isExternalLink(avatar.value)) return avatar.value
  return withBase(avatar.value)
})
const avatarLink = computed(() => theme.value.avatarLink || '/')
const author = computed(() => theme.value.author || site.value.title || 'Blog')
const initials = computed(() => author.value.trim().slice(0, 2).toUpperCase())

function href(item) {
  if (item.external || isExternalLink(item.url)) return item.url
  return withBase(item.url || '/')
}

function active(item) {
  if (item.external || isExternalLink(item.url)) return false
  const current = normalizePath(route.path, site.value.base)
  const target = normalizePath(item.url)
  return current === target || (target !== '/' && current.startsWith(`${target}/`))
}

watch(avatar, () => {
  avatarFailed.value = false
})
</script>

<template>
  <aside class="side-nav" :class="{ open, compact }" aria-label="主导航">
    <div class="nav-profile">
      <a
        class="avatar-link"
        :href="isExternalLink(avatarLink) ? avatarLink : withBase(avatarLink)"
        :target="isExternalLink(avatarLink) ? '_blank' : undefined"
        :rel="isExternalLink(avatarLink) ? 'noopener noreferrer' : undefined"
        aria-label="返回首页"
        @click="$emit('navigate')"
      >
        <img v-if="!avatarFailed" :src="avatarHref" :alt="`${author} 的头像`" @error="avatarFailed = true">
        <span v-else class="avatar-fallback">{{ initials }}</span>
      </a>
      <div class="profile-copy">
        <strong>{{ author }}</strong>
        <a v-if="theme.email" :href="`mailto:${theme.email}`">{{ theme.email }}</a>
        <span v-else>{{ theme.subTitle || '做个日常记录' }}</span>
      </div>
    </div>

    <nav class="menu-list">
      <a
        v-for="item in menus"
        :key="`${item.text}-${item.url}`"
        class="menu-item"
        :class="{ active: active(item) }"
        :href="href(item)"
        :target="item.external || isExternalLink(item.url) ? '_blank' : undefined"
        :rel="item.external || isExternalLink(item.url) ? 'noopener noreferrer' : undefined"
        :aria-current="active(item) ? 'page' : undefined"
        :title="compact ? item.text : undefined"
        @click="$emit('navigate')"
      >
        <span class="menu-icon"><Icon :name="item.icon && !item.icon.includes(' ') ? item.icon : iconForMenu(item)" /></span>
        <span class="menu-text">{{ item.text }}</span>
      </a>
    </nav>
  </aside>
</template>
