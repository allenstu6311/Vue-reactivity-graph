export type { NodeType, GraphNode, GraphData, ComponentMeta } from './types'

import type { GraphData, GraphNode, ComponentMeta } from './types'

const graph: GraphData = { components: {}, nodes: {}, stores: {} }

let updateCallback: (() => void) | null = null
let scheduled = false

export function setOnUpdate(cb: () => void): void {
  updateCallback = cb
}

export function notifyUpdate(): void {
  // debounce：同一輪同步堆疊內的多次呼叫只排程一次 refresh。
  // 切斷「snapshot 讀 computed.value → onTrack → notifyUpdate → refreshGraph → 再讀」的同步再入迴圈：
  // 排程的 refresh 等堆疊清空後才跑，此時 computed 已求值進快取、不再觸發 onTrack，自然終止。
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    updateCallback?.()
  })
}

export function updateComponent(uid: string, meta: ComponentMeta): void {
  graph.components[uid] = meta
}

export function updateNodes(uid: string, nodes: GraphNode[]): void {
  graph.nodes[uid] = nodes
}

export function updateStore(storeId: string, nodes: GraphNode[]): void {
  graph.stores[storeId] = nodes
}

export function clearGraph(): void {
  graph.components = {}
  graph.nodes = {}
  graph.stores = {}
}

export function getGraphData(): GraphData {
  return graph
}
