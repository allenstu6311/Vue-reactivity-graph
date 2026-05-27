<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VariableList from './components/VariableList.vue'
import GraphView from './components/GraphView.vue'
import ComponentTree from './components/ComponentTree.vue'
import NodeDetail from './components/NodeDetail.vue'
import type { GraphData } from '../graph'
import { useGraphFetcher } from './composables/useGraphFetcher'
import { useDevtoolsConnection } from './composables/useDevtoolsConnection'
import { TAB } from './tabs'
import type { Tab } from './tabs'
import { NODE_TYPES } from './nodeTypeMeta'

type RightMode = 'select' | 'graph'

const graph = ref<GraphData>({ components: {}, nodes: {}, stores: {} })
const selectedUid = ref<string>('')
const selectedId = ref<string | null>(null)
const activeTab = ref<Tab>(TAB.Components)
const rightMode = ref<RightMode>('select')
const searchQuery = ref('')
const leftTab = ref<'list' | 'detail'>('list')

const currentNodes = computed(() => graph.value.nodes[selectedUid.value] ?? [])
const allNodes = computed(() => [
  ...Object.values(graph.value.nodes).flat(),
  ...Object.values(graph.value.stores).flat(),
])

const selectedComponentName = computed(() => {
  return graph.value.components[selectedUid.value]?.name ?? null
})

const detailNode = computed(
  () => allNodes.value.find(n => n.id === selectedId.value) ?? null
)

function onSelectComponent(uid: string) {
  selectedUid.value = uid
  rightMode.value = 'graph'
  const nodes = graph.value.nodes[uid] ?? []
  let firstId: string | null = null
  for (const type of NODE_TYPES) {
    const found = nodes.find(n => n.type === type)
    if (found) { firstId = found.id; break }
  }
  selectedId.value = firstId
  leftTab.value = 'list'
}

function onSelectTab(tab: Tab) {
  activeTab.value = tab
  if (tab === TAB.Stores) rightMode.value = 'graph'
  leftTab.value = 'list'
}

function toggleComponentTree() {
  rightMode.value = (rightMode.value === 'graph' || !selectedUid.value) ? 'select' : 'graph'
}

function onSelectVariable(id: string) {
  selectedId.value = id
  rightMode.value = 'graph'
}

function onGraphNodeSelect(id: string) {
  selectedId.value = id
  leftTab.value = 'detail'
}

const { fetchGraph } = useGraphFetcher()

async function handleFetchGraph() {
  const prevUid = selectedUid.value
  const result = await fetchGraph()
  if (!result) return
  graph.value = result
  if (!selectedUid.value || !result.components[selectedUid.value]) {
    const nextUid = Object.keys(result.components)[0] ?? ''
    if (prevUid && prevUid !== nextUid) rightMode.value = 'select'
    selectedUid.value = nextUid
    selectedId.value = null
  }
}

useDevtoolsConnection(handleFetchGraph)

onMounted(() => {
  handleFetchGraph()
})
</script>

<template>
  <div class="shell">
    <div class="panel">
      <!-- LEFT: variable list -->
      <div class="left-wrapper">
        <!-- Main tab bar -->
        <div class="tab-bar">
          <button :class="['tab-btn', { active: activeTab === TAB.Components }]" @click="onSelectTab(TAB.Components)">
            Components
          </button>
          <button :class="['tab-btn', { active: activeTab === TAB.Stores }]" @click="onSelectTab(TAB.Stores)">
            Stores
          </button>
        </div>

        <!-- Sub tab bar -->
        <div class="tab-bar">
          <button :class="['tab-btn', { active: leftTab === 'list' }]" @click="leftTab = 'list'">List</button>
          <button :class="['tab-btn', { active: leftTab === 'detail' }]" @click="leftTab = 'detail'">Detail</button>
        </div>

        <!-- Selector row -->
        <div class="comp-select-wrap">
          <div class="select-row">
            <button
              class="comp-trigger-btn"
              :disabled="activeTab === TAB.Stores"
              @click="toggleComponentTree()"
            >
              <span v-if="selectedComponentName" class="trigger-name">&lt;{{ selectedComponentName }}&gt;</span>
              <span v-else class="trigger-placeholder">Select component...</span>
            </button>
            <button class="refresh-btn" title="Refresh" @click="handleFetchGraph">↺</button>
          </div>
        </div>

        <VariableList
          v-show="leftTab === 'list'"
          :nodes="activeTab === TAB.Components ? currentNodes : Object.values(graph.stores).flat()"
          :selected-id="selectedId"
          :group-by="activeTab === TAB.Stores ? 'store' : undefined"
          @select="onSelectVariable($event)"
        />

        <NodeDetail
          v-show="leftTab === 'detail'"
          :node="detailNode"
        />
      </div>

      <!-- RIGHT: graph -->
      <div class="right">
        <ComponentTree
          v-if="rightMode === 'select' && activeTab === TAB.Components"
          v-model:searchQuery="searchQuery"
          :graph="graph"
          :selected-uid="selectedUid"
          @select="onSelectComponent"
        />
        <GraphView v-else :nodes="allNodes" :selected-id="selectedId" @select-node="onGraphNodeSelect" />
      </div>
    </div>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Outfit', sans-serif;
  background: #0b0e14;
  color: #cdd9ee;
  height: 100vh;
  overflow: hidden;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>

<style scoped>
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Tab bar */
.dt-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: #111622;
  border-bottom: 1px solid #1f2e45;
  padding: 0 16px;
  flex-shrink: 0;
}

.dt-tab {
  padding: 0 13px;
  height: 100%;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #334560;
  border-bottom: 2px solid transparent;
}

.dt-tab.active  { color: #6e89b0; border-bottom-color: #5c72ab; }
.dt-tab.vue-tab { color: #42d392; border-bottom-color: #42d392; font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 11px; }

/* Layout */
.panel {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.left-wrapper {
  width: 252px;
  flex-shrink: 0;
  border-right: 1px solid #1f2e45;
  background: #111622;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.comp-select-wrap {
  padding: 10px;
  border-bottom: 1px solid #1f2e45;
}

.select-row {
  display: flex;
  gap: 6px;
}

.comp-select {
  background: #1c2840;
  border: 1px solid #2a3f5c;
  color: #cdd9ee;
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
  flex: 1;
}

.comp-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.refresh-btn {
  background: #1c2840;
  border: 1px solid #2a3f5c;
  color: #6e89b0;
  border-radius: 5px;
  padding: 0 8px;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: color .15s, border-color .15s;
}

.refresh-btn:hover {
  color: #42d392;
  border-color: #42d392;
}

.right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid #1f2e45;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 8px 0;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  background: transparent;
  border: none;
  color: #4a5f7a;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color .15s, border-color .15s;
}

.tab-btn.active {
  color: #cdd9ee;
  border-bottom-color: #5c72ab;
}

.tab-btn:hover:not(.active) {
  color: #8aa4c8;
}

.comp-trigger-btn {
  flex: 1;
  background: #1c2840;
  border: 1px solid #2a3f5c;
  color: #cdd9ee;
  border-radius: 5px;
  padding: 0 10px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color .15s;
  height: 30px;
}

.comp-trigger-btn:hover:not(:disabled) {
  border-color: #42d392;
}

.comp-trigger-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.trigger-name {
  color: #42d392;
}

.trigger-placeholder {
  color: #4a5f7a;
}
</style>
