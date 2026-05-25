export type NodeType = 'ref' | 'reactive' | 'computed' | 'watch' | 'store' | 'prop' | 'inject'

export interface ComponentMeta {
  uid: number
  parentUid?: number
  name: string
  path: string
  filePath: string
}

export interface GraphNode {
  id: string       // `${uid}.${varName}`（例如 "12.count"），全域唯一
  uid?: number       // Vue component instance uid；store 節點可選
  parentUid?: number // 父層 component 的 uid
  name: string      // 顯示名，例如 "HomeView"（不帶路徑、不帶 _N）
  path?: string      // 祖先路徑，例如 "App.HomeView"（不帶 _N）
  varName?: string  // 變數短名
  type: NodeType
  subtype?: NodeType   // 僅 store 節點設定，紀錄底下真實 reactive type
  val: unknown
  filePath: string
  deps: string[]  // 依賴節點的完整 id（uid-based 格式，例如 "12.price"），computed / watch 有
  subs: string[]  // 訂閱者節點的完整 id（uid-based 格式），ref / reactive / computed 有
}

export interface GraphData {
  components: Record<string, ComponentMeta>
  nodes: Record<string, GraphNode[]>
  stores: Record<string, GraphNode[]>
}
