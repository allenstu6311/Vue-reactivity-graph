import dagre from '@dagrejs/dagre'
import type { GraphNode } from '../../graph'
import { type Node, type Edge, MarkerType } from '@vue-flow/core'
const NW = 148
const NH = 66

export function buildLayout(
  allNodes: GraphNode[],
  selectedId: string,
): { nodes: Node[]; edges: Edge[] } {
  const focused = allNodes.find(n => n.id === selectedId)
  if (!focused) return { nodes: [], edges: [] }

  const compPrefix = selectedId.split('.').slice(0, -1).join('.')
  // deps/subs 存的可能是短名（"price"）或完整 id（"App.ElTable.data"），先直查，找不到再用所在元件的 prefix 補全
  function findNode(nameOrId: string, contextNodeId?: string): GraphNode | undefined {
    const prefix = contextNodeId
      ? contextNodeId.split('.').slice(0, -1).join('.')
      : compPrefix
    return allNodes.find(n => n.id === nameOrId)
      ?? allNodes.find(n => n.id === `${prefix}.${nameOrId}`)
  }

  const depNodes = (focused.deps ?? []).map(d => findNode(d)).filter(Boolean) as GraphNode[]
  const subNodes = (focused.subs ?? []).map(s => findNode(s)).filter(Boolean) as GraphNode[]

  // seen 防止 BFS 重複走同一節點，例如 a.deps=[b], b.deps=[a] 互相依賴時不會無限迴圈
  const seen = new Set<string>([focused.id])
  const uniqueDeps = depNodes.filter(n => !seen.has(n.id) && seen.add(n.id))
  const uniqueSubs = subNodes.filter(n => !seen.has(n.id) && seen.add(n.id))

  // BFS 往 deps 方向展開
  const upstreamNodes: GraphNode[] = []
  const upstreamEdges: [string, string][] = []
  const upQueue = [...uniqueDeps]
  while (upQueue.length > 0) {
    const node = upQueue.shift()!
    for (const depName of node.deps ?? []) {
      const dep = findNode(depName, node.id)
      if (!dep) continue
      upstreamEdges.push([dep.id, node.id])
      if (!seen.has(dep.id)) {
        seen.add(dep.id)
        upstreamNodes.push(dep)
        upQueue.push(dep)
      }
    }
  }

  // BFS 往 subs 方向展開（computed 會繼續往下，watch 自然停止）
  const downstreamNodes: GraphNode[] = []
  const downstreamEdges: [string, string][] = []
  const queue = [...uniqueSubs]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (const subName of node.subs ?? []) {
      const sub = findNode(subName, node.id)
      if (!sub) continue
      downstreamEdges.push([node.id, sub.id])
      if (!seen.has(sub.id)) {
        seen.add(sub.id)
        downstreamNodes.push(sub)
        queue.push(sub)
      }
    }
  }

  const graphNodes = [focused, ...upstreamNodes, ...uniqueDeps, ...uniqueSubs, ...downstreamNodes]

  // Build dagre graph
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  graphNodes.forEach(n => g.setNode(n.id, { width: NW, height: NH }))
  upstreamEdges.forEach(([src, tgt]) => g.setEdge(src, tgt))
  uniqueDeps.forEach(n => g.setEdge(n.id, focused.id))
  uniqueSubs.forEach(n => g.setEdge(focused.id, n.id))
  downstreamEdges.forEach(([src, tgt]) => g.setEdge(src, tgt))

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
    ...upstreamEdges.map(([src, tgt]) => ({
      id: `${src}->${tgt}`,
      source: src,
      target: tgt,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    })),
    ...uniqueDeps.map(n => ({
      id: `${n.id}->${focused.id}`,
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
    ...downstreamEdges.map(([src, tgt]) => ({
      id: `${src}->${tgt}`,
      source: src,
      target: tgt,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    })),
  ]

  return { nodes: vfNodes, edges: vfEdges }
}
