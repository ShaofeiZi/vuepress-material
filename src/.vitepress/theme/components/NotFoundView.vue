<script setup>
import { withBase } from 'vitepress'
import Icon from './Icon.vue'
</script>

<template>
  <section class="content-container not-found-view">
    <div class="material-card not-found-card">
      <div class="not-found-code">404</div>
      <h1>页面走丢了</h1>
      <p>这里没有你要找的内容，回首页继续看看吧。</p>
      <a class="primary-action" :href="withBase('/')"><Icon name="home" size="20" />返回首页</a>
    </div>
  </section>
</template>
