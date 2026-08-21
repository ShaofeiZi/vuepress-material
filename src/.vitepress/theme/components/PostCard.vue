<script setup>
import { computed } from 'vue'
import { withBase } from 'vitepress'
import Icon from './Icon.vue'
import TagChip from './TagChip.vue'
import { formatDate, plainText } from '../utils.js'

const props = defineProps({
  post: { type: Object, required: true }
})

const excerpt = computed(() => props.post.excerpt || props.post.description || '')
const excerptIsHtml = computed(() => /<[^>]+>/.test(excerpt.value))
const coverUrl = computed(() => props.post.cover ? withBase(props.post.cover) : '')
</script>

<template>
  <article class="post-card material-card" :class="{ 'has-cover': coverUrl }">
    <a v-if="coverUrl" class="post-cover-link" :href="withBase(post.url)" tabindex="-1" aria-hidden="true">
      <img class="post-cover" :src="coverUrl" alt="">
    </a>
    <header>
      <h2><a class="post-title-link" :href="withBase(post.url)">{{ post.title }}</a></h2>
      <time v-if="post.date" :datetime="post.date" class="post-time">
        <Icon name="calendar" size="17" />{{ formatDate(post.date) }}
      </time>
    </header>
    <div v-if="excerpt" class="post-excerpt">
      <div v-if="excerptIsHtml" v-html="excerpt" />
      <p v-else>{{ plainText(excerpt) }}</p>
    </div>
    <footer v-if="post.tags?.length" class="post-tags">
      <TagChip v-for="tag in post.tags" :key="tag" :tag="String(tag)" />
    </footer>
  </article>
</template>
