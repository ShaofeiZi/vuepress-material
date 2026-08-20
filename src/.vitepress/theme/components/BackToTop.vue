<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

const visible = ref(false)
function update() { visible.value = window.scrollY > 300 }
function backToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }
onMounted(() => {
  update()
  window.addEventListener('scroll', update, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', update))
</script>

<template>
  <Transition name="back-to-top">
    <button v-if="visible" class="back-to-top" type="button" aria-label="返回顶部" @click="backToTop">
      <Icon name="chevron-up" />
    </button>
  </Transition>
</template>
