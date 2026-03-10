<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import VariableList from './components/VariableList.vue'
import GraphView from './components/GraphView.vue'
import type { ComponentGraph } from '../types/graph'
import { devLog } from './utils'

const graph = ref<ComponentGraph>({})
const currentComp = ref<string>('')
const selectedId = ref<string | null>(null)

const compOptions = computed(() => Object.keys(graph.value))
const currentNodes = computed(() => graph.value[currentComp.value] ?? [])

function onSwitchComp(comp: string) {
  currentComp.value = comp
  selectedId.value = null
}

function fetchGraph() {
  chrome.devtools.inspectedWindow.eval(
    'JSON.stringify(window.__vueReactivityGraph)',
    (result, err) => {
      if (err) { devLog('fetchGraph error', err); return }
      if (typeof result !== 'string') { 
        // devLog('no graph data yet'); 
        return 
      }
      const data = JSON.parse(result) as ComponentGraph
      graph.value = data
      // devLog('graph fetched, components:', Object.keys(data))
      if (!currentComp.value || !data[currentComp.value]) {
        currentComp.value = Object.keys(data)[0] ?? ''
      }
    },
  )
}

onMounted(() => {
  fetchGraph()
  chrome.devtools.network.onNavigated.addListener(fetchGraph)

  const port = chrome.runtime.connect({ name: 'devtools-panel' })
  port.onMessage.addListener((msg) => {
    if (msg.type === 'VUE_GRAPH_UPDATE') fetchGraph()
  })
})
</script>

<template>
  <div class="shell">
    <div class="panel">
      <!-- LEFT: variable list -->
      <div class="left-wrapper">
        <div class="comp-select-wrap">
          <div class="select-row">
            <select
              class="comp-select"
              :value="currentComp"
              @change="onSwitchComp(($event.target as HTMLSelectElement).value)"
            >

              <option v-for="key in compOptions" :key="key" :value="key">
                {{ graph[key][0]?.file ?? key }}.vue
              </option>
            </select>
            <button class="refresh-btn" title="Refresh" @click="fetchGraph">↺</button>
          </div>
        </div>
        <VariableList
          :nodes="currentNodes"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
      </div>

      <!-- RIGHT: graph -->
      <div class="right">
        <GraphView :nodes="currentNodes" :selected-id="selectedId" />
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
</style>
