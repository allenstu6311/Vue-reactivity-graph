<script setup lang="ts">
import { computed } from 'vue'
import { getSmoothStepPath, VueFlow } from '@vue-flow/core'
import GraphNode from './GraphNode.vue'
import { buildLayout } from '../composables/useLayout'
import type { GraphNode as GNode } from '../../types/graph'

const props = defineProps<{
  nodes: GNode[]
  selectedId: string | null
}>()

const nodeTypes = { graphNode: GraphNode }

const layout = computed(() =>
  props.selectedId ? buildLayout(props.nodes, props.selectedId) : { nodes: [], edges: [] },
)
</script>

<template>
  <div class="graph-area">
    <div v-if="!selectedId" class="empty">
      <div class="empty-ring">⬡</div>
      <span>選擇左側變數以顯示依賴圖</span>
    </div>

    <VueFlow
      v-else
      :key="selectedId"
      :nodes="layout.nodes"
      :edges="layout.edges"
      :node-types="nodeTypes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :min-zoom="0.2"
      :max-zoom="4"
      fit-view-on-init
      class="vue-flow-dark"
    >
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <polygon points="0 0,7 3.5,0 7" fill="#42d392" />
        </marker>
      </defs>
    </VueFlow>
  </div>
</template>

<style scoped>
.graph-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0b0e14;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #334560;
  font-size: 13px;
}

.empty-ring {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1.5px solid #1f2e45;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
</style>

<style>
.vue-flow-dark .vue-flow__background {
  /* background: #0b0e14; */
}

.vue-flow-dark .vue-flow__edge-path,
.vue-flow-dark .vue-flow__edge-interaction {
  stroke: #42d392;
  stroke-width: 1.5;
}

.gedge {
  stroke: #42d392;
  stroke-width: 1.5;
  opacity: 0.8;
}
</style>
