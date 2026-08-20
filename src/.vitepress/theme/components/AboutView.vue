<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'
import Icon from './Icon.vue'

const { frontmatter, page } = useData()
const title = computed(() => frontmatter.value.title || page.value.title || '关于我')
</script>

<template>
  <section class="content-container about-view">
    <div class="material-card about-card">
      <div class="section-heading">
        <Icon name="user" />
        <div><h1>{{ title }}</h1><p>About</p></div>
      </div>
      <div class="article-content vp-doc"><Content /></div>
    </div>
  </section>
</template>
