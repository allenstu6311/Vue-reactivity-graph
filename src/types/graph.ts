export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch'

export interface GraphNode {
  id: string       // `${componentName}.${varName}`，全域唯一
  varName: string  // 變數短名
  type: NodeType
  val: any
  file: string
  deps: string[]  // 依賴的變數名稱（短名），computed / watch 有
  subs: string[]  // 被訂閱的變數名稱（短名），ref / reactive / computed 有
}

export type ComponentGraph = Record<string, GraphNode[]>

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
