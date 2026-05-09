export type { NodeType, GraphNode, GraphData } from './types'

import type { GraphData, GraphNode } from './types'

const graph: GraphData = { components: {}, stores: {} }

let updateCallback: (() => void) | null = null

export function setOnUpdate(cb: () => void): void {
  updateCallback = cb
}

export function notifyUpdate(): void {
  updateCallback?.()
}

export function updateComponent(name: string, nodes: GraphNode[]): void {
  graph.components[name] = nodes
}

export function updateStore(storeId: string, nodes: GraphNode[]): void {
  graph.stores[storeId] = nodes
}

export function getGraphData(): GraphData {
  return graph
}
