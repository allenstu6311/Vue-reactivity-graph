<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GraphNode } from '../../types/graph'
import { NODE_TYPE_META, NODE_TYPES } from '../nodeTypeMeta'

const props = defineProps<{
  nodes: GraphNode[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const search = ref('')


function displayName(n: GraphNode): string {
  if (n.type === 'watch') return `watch(${(n.deps ?? []).join(', ')})`
  return n?.varName || ''
}

function getCount(n: GraphNode): number {
  if (n.type === 'ref' || n.type === 'reactive') return n.subs?.length ?? 0
  return n.deps?.length ?? 0
}

const grouped = computed(() => {
  const q = search.value.toLowerCase()
  return NODE_TYPES.map(type => ({
    type,
    config: NODE_TYPE_META[type],
    items: props.nodes.filter(
      n => n.type === type && displayName(n).toLowerCase().includes(q),
    ),
  })).filter(g => g.items.length > 0)
})
</script>

<template>
  <div class="left">
    <div class="left-top">
      <input
        v-model="search"
        class="search-box"
        type="text"
        placeholder="搜尋變數…"
      />
    </div>
    <div class="left-list">
      <template v-for="group in grouped" :key="group.type">
        <div
          class="sec-header"
          :style="{ color: group.config.color, borderLeft: `2px solid ${group.config.color}` }"
        >
          {{ group.config.label }}
        </div>
        <div
          v-for="node in group.items"
          :key="node.id"
          class="var-row"
          :class="{ active: selectedId === node.id }"
          @click="emit('select', node.id)"
        >
          <span class="tbadge" :class="`tb-${node.type}`">{{ group.config.label }}</span>
          <span class="var-name">{{ displayName(node) }}</span>
          <span class="var-cnt" :class="{ lit: getCount(node) > 0 }">{{ getCount(node) }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.left {
  width: 252px;
  flex-shrink: 0;
  border-right: 1px solid #1f2e45;
  background: #111622;
  display: flex;
  flex-direction: column;
}

.left-top {
  padding: 10px;
  border-bottom: 1px solid #1f2e45;
}

.search-box {
  background: #1c2840;
  border: 1px solid #2a3f5c;
  color: #cdd9ee;
  border-radius: 5px;
  padding: 6px 10px 6px 28px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
  width: 100%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%23334560' stroke-width='2.5'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 9px center;
}

.search-box::placeholder { color: #334560; }

.left-list {
  flex: 1;
  overflow-y: auto;
}

.sec-header {
  padding: 6px 11px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  background: #0b0e14;
  border-bottom: 1px solid #1f2e45;
  position: sticky;
  top: 0;
  z-index: 1;
}

.var-row {
  padding: 8px 11px;
  border-bottom: 1px solid #1f2e45;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: background .1s;
}

.var-row:hover { background: #172030; }
.var-row.active { background: #172030; border-left: 2px solid #42d392; padding-left: 9px; }

.tbadge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  flex-shrink: 0;
}

.tb-ref      { background: rgba(74,222,128,.08);  color: #4ade80; border: 1px solid rgba(74,222,128,.28); }
.tb-reactive { background: rgba(251,146,60,.08);  color: #fb923c; border: 1px solid rgba(251,146,60,.28); }
.tb-computed { background: rgba(96,165,250,.08);  color: #60a5fa; border: 1px solid rgba(96,165,250,.28); }
.tb-watch    { background: rgba(192,132,252,.08); color: #c084fc; border: 1px solid rgba(192,132,252,.28); }

.var-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cdd9ee;
}

.var-cnt {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #1c2840;
  color: #334560;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.var-cnt.lit { background: rgba(66,211,146,.15); color: #42d392; }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: #2a3f5c; border-radius: 2px; }
</style>
