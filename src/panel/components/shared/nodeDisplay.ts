import type { GraphNode } from '../../../graph/types'

export function getDisplayName(node: GraphNode): string {
  if (node.type === 'watch') return `watch(${node.deps.join(', ')})`
  return node.varName || ''
}
