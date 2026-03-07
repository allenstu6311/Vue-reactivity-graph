import dagre from '@dagrejs/dagre'
import type { GraphNode } from '../../types/graph'
import { type Node, type Edge, MarkerType } from '@vue-flow/core'
import { devLog } from '../utils'

const NW = 148
const NH = 66

export function buildLayout(
  allNodes: GraphNode[],
  selectedId: string,
): { nodes: Node[]; edges: Edge[] } {
  devLog('buildLayout', { allNodes, selectedId })
  const focused = allNodes.find(n => n.id === selectedId)
  if (!focused) return { nodes: [], edges: [] }

  const compPrefix = selectedId.split('.')[0]

  function findNode(shortName: string): GraphNode | undefined {
    return allNodes.find(n => n.id === `${compPrefix}.${shortName}`)
  }

  const depNodes = (focused.deps ?? []).map(findNode).filter(Boolean) as GraphNode[]
  const subNodes = (focused.subs ?? []).map(findNode).filter(Boolean) as GraphNode[]

  // Deduplicate: focused might also appear in deps/subs
  const seen = new Set<string>([focused.id])
  const uniqueDeps = depNodes.filter(n => !seen.has(n.id) && seen.add(n.id))
  const uniqueSubs = subNodes.filter(n => !seen.has(n.id) && seen.add(n.id))
  const graphNodes = [focused, ...uniqueDeps, ...uniqueSubs]

  // Build dagre graph
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  graphNodes.forEach(n => g.setNode(n.id, { width: NW, height: NH }))
  uniqueDeps.forEach(n => g.setEdge(n.id, focused.id))
  uniqueSubs.forEach(n => g.setEdge(focused.id, n.id))

  dagre.layout(g)

  const vfNodes: Node[] = graphNodes.map(n => {
    const { x, y } = g.node(n.id)
    return {
      id: n.id,
      type: 'graphNode',
      position: { x: x - NW / 2, y: y - NH / 2 },
      data: { ...n, focused: n.id === selectedId },
    }
  })

  const vfEdges: Edge[] = [
    // computed如果被依賴了，會同時出現在deps和subs裡（因為它既是被依賴者也是依賴者），所以會有重複邊，這裡用uniqueDeps/subs過濾掉重複的
    ...uniqueDeps.map(n => ({
      id: `${n.id}-${focused.id}`,
      source: n.id,
      target: focused.id,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    })),
    ...uniqueSubs.map(n => ({
      id: `${focused.id}->${n.id}`,
      source: focused.id,
      target: n.id,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    })),
  ]

  return { nodes: vfNodes, edges: vfEdges }
}
