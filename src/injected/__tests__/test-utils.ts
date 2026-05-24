// 所有測試檔必須統一從 'vue' 匯入，不得使用 '@vue/runtime-core'。
// 原因：Pinia 內部使用 'vue'；若測試元件或 createRenderer 改用 '@vue/runtime-core'，
// 兩者成為獨立的 module instance，各自的 activeEffect / currentInstance 全域變數不共享，
// 導致 storeToRefs ObjectRefImpl 的 onTrack 無法觸發，watch 節點也無法被偵測。
import { createRenderer } from 'vue'
import type { ExtendedComponentInstance } from '../../types/vue-internals'
import { runScan } from '../walker'
import { WalkContext } from '../context/WalkContext'
import { getGraphData } from '../../graph'
import type { GraphData, GraphNode } from '../../graph'

// Null renderer — 不需要 DOM，可在 Node.js 環境執行
// 所有 host operations 皆為 no-op，元件 setup / reactivity 行為與 DOM renderer 完全相同
const { createApp: createNullApp } = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  insert: () => {},
  remove: () => {},
  parentNode: () => null,
  nextSibling: () => null,
} as any)

function clearGraph(): void {
  const g = getGraphData()
  for (const key of Object.keys(g.components)) {
    delete (g.components as any)[key]
  }
  for (const key of Object.keys(g.nodes)) {
    delete (g.nodes as any)[key]
  }
  for (const key of Object.keys(g.stores)) {
    delete (g.stores as any)[key]
  }
}

/**
 * 透過 path 查找 component nodes
 * 例：getComponentNodes(graph, 'App.HomeView') 返回 path 為 'App.HomeView' 的節點陣列
 */
export function getComponentNodes(graph: GraphData, path: string): GraphNode[] {
  for (const [uid, meta] of Object.entries(graph.components)) {
    if (meta.path === path) return graph.nodes[uid] ?? []
  }
  return []
}

/**
 * 根據 path 和 varName 推導完整的 uid-based id
 * 例：makeId(graph, 'App.HomeView', 'count') 返回 "12.count"
 */
export function makeId(graph: GraphData, path: string, varName: string): string {
  for (const [, meta] of Object.entries(graph.components)) {
    if (meta.path === path) return `${meta.uid}.${varName}`
  }
  console.error('makeId failed for path:', path, 'Available:',
    Object.values(graph.components).map(m => ({ path: m.path, uid: m.uid })))
  throw new Error(`Cannot find component with path "${path}"`)
}

/**
 * 建立 Vue app、執行 walker 完整流程（runScan），回傳 graph 快照
 *
 * 流程與 injected/index.ts 一致：runScan 包含 collectPiniaState + Phase 1/2
 */
export function runWalker(rootComponent: any, plugins: any[] = []): GraphData {
  clearGraph()

  const app = createNullApp(rootComponent)
  for (const plugin of plugins) app.use(plugin)
  const container = {} as any
  app.mount(container)

  const rootInstance = (app as any)._instance as ExtendedComponentInstance

  const ctx = new WalkContext()
  runScan(rootInstance, ctx)

  // 回傳淺拷貝，避免後續測試汙染
  const g = getGraphData()
  return {
    components: { ...g.components },
    nodes: Object.fromEntries(Object.entries(g.nodes).map(([k, v]) => [k, [...v]])),
    stores: Object.fromEntries(Object.entries(g.stores).map(([k, v]) => [k, [...v]])),
  }
}
