<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { GraphNode } from '../../types/graph'
import { NODE_TYPE_META } from '../nodeTypeMeta'

const props = defineProps<{
  data: GraphNode & { focused: boolean }
}>()

const tc = computed(() => NODE_TYPE_META[props.data.type])

const displayName = computed(() => {
  if (props.data.type === 'watch') {
    return `watch(${(props.data.deps ?? []).join(', ')})`
  }
  return props.data.varName || ''
})

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
</script>

<template>
  <Handle type="target" :position="Position.Left" />
  <div
    class="graph-node"
    :style="{
      background: tc.background,
      border: `${data.focused ? 2 : 1.2}px solid ${tc.color}`,
      boxShadow: data.focused ? `0 0 8px ${tc.color}` : 'none',
    }"
  >
    <div class="n-type" :style="{ color: data.focused ? tc.color : '#4a6080' }">
      {{ tc.label.toUpperCase() }}
    </div>
    <div class="n-name" :style="{ color: data.focused ? '#e8f4ff' : '#cdd9ee' }">
      {{ truncate(displayName, 18) }}
    </div>
    <div class="n-file">{{ truncate(data.file, 22) }}</div>
    <div v-if="data.val && data.val !== '—'" class="n-val">
      {{ truncate(String(data.val), 14) }}
    </div>
  </div>
  <Handle type="source" :position="Position.Right" />
</template>

<style scoped>
.graph-node {
  width: 148px;
  height: 66px;
  border-radius: 7px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.n-type {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: .05em;
}

.n-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
}

.n-file {
  font-family: 'Outfit', sans-serif;
  font-size: 9.5px;
  color: #4a6080;
}

.n-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #fbbf24;
}
</style>
