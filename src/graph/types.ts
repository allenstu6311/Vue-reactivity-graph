export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch' | 'component' | 'store' | 'prop' | 'inject'

export interface GraphNode {
  id: string       // `${componentName}.${varName}`，全域唯一
  varName?: string  // 變數短名
  type: NodeType
  val: unknown
  file: string
  deps: string[]  // 依賴節點的完整 id（`componentName.varName` 格式），computed / watch 有
  subs: string[]  // 訂閱者節點的完整 id（`componentName.varName` 格式），ref / reactive / computed 有
}

export interface GraphData {
  components: Record<string, GraphNode[]>
  stores: Record<string, GraphNode[]>
}
