export type { NodeType, GraphNode, GraphData, ComponentMeta } from './types'

import type { GraphData, GraphNode, ComponentMeta } from './types'

const graph: GraphData = { components: {}, nodes: {}, stores: {} }

let updateCallback: (() => void) | null = null

export function setOnUpdate(cb: () => void): void {
  updateCallback = cb
}

export function notifyUpdate(): void {
  updateCallback?.()
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
