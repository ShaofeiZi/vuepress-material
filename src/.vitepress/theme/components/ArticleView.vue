<script setup>
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import Icon from './Icon.vue'
import TagChip from './TagChip.vue'
import { formatDate } from '../utils.js'

const props = defineProps({
  post: { type: Object, default: null },
  posts: { type: Array, default: () => [] }
})

const { frontmatter, page } = useData()
const article = computed(() => props.post || {
  title: frontmatter.value.title || page.value.title,
  date: frontmatter.value.date,
  tags: frontmatter.value.tags || [],
  url: page.value.relativePath
})
const index = computed(() => props.posts.findIndex(post => post.url === props.post?.url))
const previous = computed(() => index.value > 0 ? props.posts[index.value - 1] : null)
const next = computed(() => index.value >= 0 && index.value < props.posts.length - 1 ? props.posts[index.value + 1] : null)
</script>

<template>
  <section class="content-container article-view">
    <article class="material-card article-card">
      <header class="article-header">
        <h1>{{ article.title }}</h1>
        <time v-if="article.date" :datetime="article.date" class="post-time">
          <Icon name="calendar" size="18" />{{ formatDate(article.date) }}
        </time>
      </header>
      <div class="article-content vp-doc"><Content /></div>
      <footer v-if="article.tags?.length" class="post-tags article-tags">
        <TagChip v-for="tag in article.tags" :key="tag" :tag="String(tag)" />
      </footer>
    </article>

    <nav v-if="previous || next" class="post-navigation" aria-label="相邻文章">
      <a v-if="previous" class="post-nav-link previous" :href="withBase(previous.url)">
        <Icon name="chevron-left" />
        <span><small>上一篇</small><strong>{{ previous.title }}</strong></span>
      </a>
      <span v-else />
      <a v-if="next" class="post-nav-link next" :href="withBase(next.url)">
        <span><small>下一篇</small><strong>{{ next.title }}</strong></span>
        <Icon name="chevron-right" />
      </a>
    </nav>
  </section>
</template>
