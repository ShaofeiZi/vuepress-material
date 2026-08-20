<script setup>
import { withBase } from 'vitepress'
import { tagHref } from '../utils.js'

defineProps({
  tag: { type: String, required: true },
  count: { type: Number, default: 0 },
  active: Boolean
})

defineEmits(['select'])
</script>

<template>
  <a
    class="tag-chip"
    :class="{ active }"
    :href="tagHref(tag, withBase)"
    :aria-current="active ? 'true' : undefined"
    @click="$emit('select', $event)"
  >
    <span>#{{ tag }}</span><span v-if="count" class="tag-count">{{ count }}</span>
  </a>
</template>
