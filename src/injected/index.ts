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
const hmr = (window as any).__VUE_HMR_RUNTIME__


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
    // window.postMessage({ type: 'VUE_GRAPH_UPDATE' }, '*')
    window.postMessage({type: 'VUE_GRAPH_UPDATE' },'*')
  }

  
  if (hmr) {
    const originalReload = hmr.reload
    const originalRerender = hmr.rerender

    hmr.reload = function(id: string, newComp: any) {
      originalReload.call(this, id, newComp)
      // originalReload 內部用 queueJob 排程，是非同步的
      // 必須等 Vue scheduler flush 後才能拿到新的 instance
      setTimeout(() => {
        const freshApp = appEl?.__vue_app__?._instance
        if (!freshApp) return
        console.log('freshApp', freshApp)
        const g = getGraph()
        Object.keys(g).forEach(k => delete g[k])
        traverse(freshApp)
        refreshGraph()
      }, 0)  // 0ms 就夠，因為 Vue scheduler 在 microtask 跑
    }


    // hmr.rerender = function(id: string, newRender: any) {
    //   console.log('hmr rerender', id)
    // //   originalRerender.call(this, id, newRender)
    // //   setTimeout(() => {
    // //     traverse(app)
    // //     // refreshGraph()
    // //   }, 50)
    // }
  }

  setOnUpdate(refreshGraph)
  traverse(app)
  refreshGraph()
}
