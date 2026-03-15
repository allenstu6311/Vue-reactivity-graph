export type { NodeType, GraphNode, ComponentGraph } from './types'

import type { ComponentGraph, GraphNode } from './types'

const graph: ComponentGraph = {}

let updateCallback: (() => void) | null = null

export function setOnUpdate(cb: () => void): void {
  updateCallback = cb
}

export function notifyUpdate(): void {
  updateCallback?.()
}

export function getGraph(): ComponentGraph {
  return graph
}

export function updateGraph(name: string, nodes: GraphNode[]): void {
  graph[name] = nodes
}
