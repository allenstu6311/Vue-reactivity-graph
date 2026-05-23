export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch' | 'component' | 'store' | 'prop' | 'inject'

export interface GraphNode {
  id: string       // `${uid}.${varName}`（例如 "12.count"），全域唯一；例外：`type: 'component'` metadata sentinel 的 id 為 uid.toString()
  uid?: number       // Vue component instance uid；component 節點必填，store 節點可選
  parentUid?: number // 父層 component 的 uid；component sentinel 節點必填（root 為 undefined）
  name?: string      // 顯示名，例如 "HomeView"（不帶路徑、不帶 _N）
  path?: string      // 祖先路徑，例如 "App.HomeView"（不帶 _N）
  varName?: string  // 變數短名
  type: NodeType
  val: unknown
  file: string
  filePath: string
  deps: string[]  // 依賴節點的完整 id（uid-based 格式，例如 "12.price"），computed / watch 有
  subs: string[]  // 訂閱者節點的完整 id（uid-based 格式），ref / reactive / computed 有
}

export interface GraphData {
  components: Record<string, GraphNode[]>
  stores: Record<string, GraphNode[]>
}
