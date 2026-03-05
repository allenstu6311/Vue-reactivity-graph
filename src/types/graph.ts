export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch'

export interface GraphNode {
  id: string       // `${componentName}.${varName}`，全域唯一
  type: NodeType
  val: string
  file: string
  deps?: string[]  // 依賴的變數名稱，computed / watch 有
  subs?: string[]  // 被訂閱的變數名稱，ref / reactive / computed 有
}

export type ComponentGraph = Record<string, GraphNode[]>
