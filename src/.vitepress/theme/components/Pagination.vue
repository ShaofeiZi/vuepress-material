<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  current: { type: Number, default: 1 },
  total: { type: Number, default: 1 }
})

defineEmits(['change'])

const items = computed(() => {
  if (props.total <= 7) return Array.from({ length: props.total }, (_, index) => index + 1)
  const values = new Set([1, props.total, props.current - 1, props.current, props.current + 1])
  const pages = [...values].filter(value => value > 0 && value <= props.total).sort((a, b) => a - b)
  const result = []
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) result.push(`gap-${page}`)
    result.push(page)
  })
  return result
})
</script>

<template>
  <nav v-if="total > 1" class="pagination" aria-label="文章分页">
    <button type="button" :disabled="current <= 1" aria-label="上一页" @click="$emit('change', current - 1)">
      <Icon name="chevron-left" size="20" />
    </button>
    <template v-for="item in items" :key="item">
      <span v-if="typeof item === 'string'" class="pagination-gap">…</span>
      <button
        v-else
        type="button"
        :class="{ active: item === current }"
        :aria-current="item === current ? 'page' : undefined"
        :aria-label="`第 ${item} 页`"
        @click="$emit('change', item)"
      >{{ item }}</button>
    </template>
    <button type="button" :disabled="current >= total" aria-label="下一页" @click="$emit('change', current + 1)">
      <Icon name="chevron-right" size="20" />
    </button>
  </nav>
</template>
