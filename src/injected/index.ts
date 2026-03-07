import { traverse } from './walker'
import type { ExtendedComponentInstance } from '../types/vue-internals'
import { getGraph, setOnUpdate } from '../types/graph'
import type { NodeType } from '../types/graph'

interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null
  }
}

const appEl = document.querySelector('#app') as (Element & VueAppInternals) | null
const app = appEl?.__vue_app__?._instance

if (app) {
  const graph = getGraph()

  function sanitizeVal(val: unknown, type: NodeType): unknown {
    switch (type) {
      case 'ref':
      case 'computed': return (val as any)?._value;
      case 'reactive': return { ...(val as object) }
      case 'watch':    return ''
    }
  }

  function refreshGraph() {
    const plain = Object.fromEntries(
      Object.entries(graph).map(([comp, nodes]) => [
        comp,
        nodes.map(n => ({
          id:   n.id,
          type: n.type,
          file: n.file,
          val:  sanitizeVal(n.val, n.type),
          deps: n.deps,
          subs: n.subs,
        })),
      ])
    )
    // console.log('plain', plain)
    ;(window as unknown as Record<string, unknown>).__vueReactivityGraph = plain
  }

  setOnUpdate(refreshGraph)
  traverse(app)
  refreshGraph()
}
