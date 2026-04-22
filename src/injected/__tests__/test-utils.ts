// 測試元件的 ref/reactive/computed/watch 必須從 '@vue/runtime-core' 匯入，不得從 'vue'。
// 原因：createRenderer 建立的 null renderer 與 @vue/runtime-core 共用同一個 module instance；
// 若從 'vue'（@vue/runtime-dom）匯入，Node.js ESM 會載入獨立的 module instance，
// watch effect 看不到 renderer 設定的 currentInstance，導致 watch 節點不被 walker 偵測（silent bug）。
import { createRenderer } from '@vue/runtime-core'
import type { ExtendedComponentInstance } from '../../types/vue-internals'
import { resetComponentKeyCounts, collectInstance, triggerInstance } from '../walker'
import { getGraph } from '../../graph'
import type { ComponentGraph } from '../../graph'

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
  const g = getGraph()
  for (const key of Object.keys(g)) {
    delete (g as Record<string, unknown>)[key]
  }
}

/**
 * 建立 Vue app、執行 walker 完整流程（collect → trigger），回傳 graph 快照
 *
 * 流程與 injected/index.ts 一致：
 *   resetComponentKeyCounts → collectInstance → resetComponentKeyCounts → triggerInstance
 */
export function runWalker(rootComponent: any, plugins: any[] = []): ComponentGraph {
  clearGraph()

  const app = createNullApp(rootComponent)
  for (const plugin of plugins) app.use(plugin)
  const container = {} as any
  app.mount(container)

  const rootInstance = (app as any)._instance as ExtendedComponentInstance

  resetComponentKeyCounts()
  collectInstance(rootInstance)
  resetComponentKeyCounts()
  triggerInstance(rootInstance)

  // 回傳淺拷貝，避免後續測試汙染
  const g = getGraph()
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v]]))
}
