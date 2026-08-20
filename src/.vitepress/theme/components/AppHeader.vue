<script setup>
import Icon from './Icon.vue'
import SearchBox from './SearchBox.vue'
import ShareMenu from './ShareMenu.vue'

defineProps({
  title: { type: String, default: '' },
  posts: { type: Array, default: () => [] }
})

defineEmits(['toggle-nav'])
</script>

<template>
  <header class="app-header">
    <button class="icon-button nav-toggle" type="button" aria-label="切换导航" @click="$emit('toggle-nav')">
      <Icon name="menu" />
    </button>
    <div class="header-title" :title="title">{{ title }}</div>
    <div class="header-actions">
      <SearchBox :posts="posts" />
      <ShareMenu />
    </div>
  </header>
</template>
