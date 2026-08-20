<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'

const { site, theme } = useData()
const currentYear = new Date().getFullYear()
const author = computed(() => theme.value.author || site.value.title)
const years = computed(() => {
  const since = Number(theme.value.since) || currentYear
  return since < currentYear ? `${since} - ${currentYear}` : String(currentYear)
})
</script>

<template>
  <footer class="app-footer">
    <p>博客内容遵循 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh" target="_blank" rel="noopener noreferrer">知识共享 署名-非商业性使用-相同方式共享 4.0 国际协议</a></p>
    <p><span>{{ author }} © {{ years }}</span><span>Powered by <a href="https://vitepress.dev" target="_blank" rel="noopener noreferrer">VitePress</a></span></p>
    <p v-if="theme.icpLicense"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ theme.icpLicense }}</a></p>
  </footer>
</template>
