<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VariableList from './components/VariableList.vue'
import GraphView from './components/GraphView.vue'
import type { GraphData } from '../graph'
import { useGraphFetcher } from './composables/useGraphFetcher'
import { useDevtoolsConnection } from './composables/useDevtoolsConnection'

const graph = ref<GraphData>({ components: {}, stores: {} })
const selectedComponentName = ref<string>('')
const selectedId = ref<string | null>(null)
const activeTab = ref<'components' | 'stores'>('components')

const componentKeys = computed(() => Object.keys(graph.value.components))
const currentNodes = computed(() => graph.value.components[selectedComponentName.value] ?? [])
const allNodes = computed(() => [
  ...Object.values(graph.value.components).flat(),
  ...Object.values(graph.value.stores).flat(),
])
const storeIds = computed(() =>
  Object.keys(graph.value.stores).sort()
)

function onSelectComponent(comp: string) {
  selectedComponentName.value = comp
  selectedId.value = null
}

function onSelectTab(tab: 'components' | 'stores') {
  activeTab.value = tab
}

const { fetchGraph: fetchGraphAsync } = useGraphFetcher()

async function handleFetchGraph() {
  const result = await fetchGraphAsync()
  if (!result) return
  graph.value = result
  if (!selectedComponentName.value || !result.components[selectedComponentName.value]) {
    selectedComponentName.value = Object.keys(result.components)[0] ?? ''
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
        <!-- Tab bar -->
        <div class="tab-bar">
          <button :class="['tab-btn', { active: activeTab === 'components' }]" @click="onSelectTab('components')">
            Components
          </button>
          <button :class="['tab-btn', { active: activeTab === 'stores' }]" @click="onSelectTab('stores')">
            Stores
          </button>
        </div>

        <!-- Selector row -->
        <div class="comp-select-wrap">
          <div class="select-row" v-if="activeTab === 'components'">
            <select
              class="comp-select"
              :value="selectedComponentName"
              @change="onSelectComponent(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="key in componentKeys" :key="key" :value="key">
                {{ graph.components[key][0]?.file ?? key }}.vue
              </option>
            </select>
            <button class="refresh-btn" title="Refresh" @click="handleFetchGraph">↺</button>
          </div>
          <div class="select-row" v-else>
            <select class="comp-select" disabled>
              <option value=""></option>
              <option v-for="id in storeIds" :key="id" :value="id">{{ id }}</option>
            </select>
            <button class="refresh-btn" title="Refresh" @click="handleFetchGraph">↺</button>
          </div>
        </div>

        <VariableList
          :nodes="activeTab === 'components' ? currentNodes : Object.values(graph.stores).flat()"
          :selected-id="selectedId"
          :group-by="activeTab === 'stores' ? 'store' : undefined"
          @select="selectedId = $event"
        />
      </div>

      <!-- RIGHT: graph -->
      <div class="right">
        <GraphView :nodes="allNodes" :selected-id="selectedId" />
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
</style>
