import type { GraphNode } from '../../../graph/types'
import { devLog } from '../../utils'

export function getDisplayName(node: GraphNode): string {
  if (node.type === 'watch') return 'watch'
  return node.varName || ''
}

// 葉節點值的顯示字串。
// null / undefined / 空字串用 Vue 的 {{ }} 插值會渲染成空白，這裡轉成字面字串，
// 其餘型別（number / boolean / 非空字串 / "[Circular]" 等）維持 String() 結果。
export function formatLeafValue(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (val === '') return '""'
  return String(val)
}
