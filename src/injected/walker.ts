import type { DebuggerEvent, VNode } from 'vue'
import type { ExtendedComponentInstance, WatchEffects, TrackerDebuggerEvent } from '../types/vue-internals'
import { trackSetupState, valNodeMap } from './tracker'
import { GraphNode, updateGraph, notifyUpdate } from '../types/graph';

export function traverse(instance: ExtendedComponentInstance, prevComponentName?: string | undefined): void {
  const componentName = prevComponentName ? `${prevComponentName}.${instance?.type?.__name || 'Unknown'}` : instance?.type?.__name || 'Unknown';

  const file = (instance.type as Record<string, unknown>).__name as string ?? '';
  const nodes: GraphNode[] = [];

  const rawSetupState = instance.setupState?.['__v_raw'] || {}
  if (rawSetupState) {
    trackSetupState(rawSetupState, componentName, file, nodes)
  }

  const watchEffects = instance.scope?.effects.filter(
    (e) => e !== instance.effect, // 過濾掉 component effect，因為它不是 watch 的 effect
  )

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((effect: WatchEffects, index: number) => {
      const watchShortName = `w_${index}`
      const watchNode: GraphNode = {
        id: `${componentName}.${watchShortName}`,
        type: 'watch',
        val: null,
        file,
        deps: [],
        subs: [],
      }
      nodes.push(watchNode)

      effect.onTrack = (event: DebuggerEvent) => {
        const trackerEvent = event.target as TrackerDebuggerEvent
        const depName = trackerEvent.__tracker_name ?? (trackerEvent.$id ? String(event.key) : undefined)
        if (!depName) return

        if (!watchNode.deps.includes(depName)) {
          watchNode.deps.push(depName)
        }

        const depNode = valNodeMap.get(event.target as object) || valNodeMap.get(rawSetupState[depName] as object)
        if (depNode && !depNode.subs.includes(watchShortName)) {
          depNode.subs.push(watchShortName)
        }

        notifyUpdate()
      }

      effect.run()
    })
  }



  updateGraph(componentName, nodes)

  // 繼續往下找子組件
  walkVNode(instance.subTree, componentName)

    console.log('nodes', nodes)
}

export function walkVNode(vnode: VNode, prevComponentName?: string | undefined): void {
  if (!vnode) return
  if (vnode.component) {
    traverse(vnode.component as ExtendedComponentInstance, prevComponentName) // 遞迴
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === 'object') walkVNode(child as VNode, prevComponentName)
    })
  }
}
