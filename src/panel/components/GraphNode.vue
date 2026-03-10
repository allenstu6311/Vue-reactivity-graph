<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { GraphNode } from '../../types/graph'
import { devLog } from '../utils';

const props = defineProps<{
  data: GraphNode & { focused: boolean }
}>()

const TYPE_CONFIG = {
  ref:      { c: '#4ade80', bg: 'rgba(74,222,128,.08)',  bd: 'rgba(74,222,128,.28)',  label: 'ref' },
  reactive: { c: '#fb923c', bg: 'rgba(251,146,60,.08)',  bd: 'rgba(251,146,60,.28)',  label: 'reactive' },
  computed: { c: '#60a5fa', bg: 'rgba(96,165,250,.08)',  bd: 'rgba(96,165,250,.28)',  label: 'computed' },
  watch:    { c: '#c084fc', bg: 'rgba(192,132,252,.08)', bd: 'rgba(192,132,252,.28)', label: 'watch' },
}

const tc = computed(() => TYPE_CONFIG[props.data.type])

const displayName = computed(() => {
  if (props.data.type === 'watch') {
    return `watch(${(props.data.deps ?? []).join(', ')})`
  }
  return props.data.varName
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
      background: tc.bg,
      border: `${data.focused ? 2 : 1.2}px solid ${tc.c}`,
      boxShadow: data.focused ? `0 0 8px ${tc.c}` : 'none',
    }"
  >
    <div class="n-type" :style="{ color: data.focused ? tc.c : '#4a6080' }">
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
