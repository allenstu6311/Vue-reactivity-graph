export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch' | 'component' | 'store' | 'prop'

export interface GraphNode {
  id: string       // `${componentName}.${varName}`，全域唯一
  varName?: string  // 變數短名
  type: NodeType
  val: any
  file: string
  deps: string[]  // 依賴的變數名稱（短名），computed / watch 有
  subs: string[]  // 被訂閱的變數名稱（短名），ref / reactive / computed 有
}

export type ComponentGraph = Record<string, GraphNode[]>
