import type { DebuggerEvent, VNode } from 'vue'
import type { ExtendedComponentInstance, WatchEffects, TrackerDebuggerEvent } from '../types/vue-internals'
import { trackSetupState } from './tracker'

export function traverse(instance: ExtendedComponentInstance): void {
  console.log('--- instance name ----', instance.type.__name)

  const rawSetupState = instance.setupState?.['__v_raw']
  if (rawSetupState) {
    trackSetupState(rawSetupState)
  }

  const watchEffects = instance.scope?.effects.filter(
    (e) => e !== instance.effect, // 過濾掉 component effect，因為它不是 watch 的 effect
  )

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((effect: WatchEffects) => {
      effect.__depList = new Map()
      effect.onTrack = (event: DebuggerEvent) => {
        const trackerEvent = event.target as TrackerDebuggerEvent
        const depName = trackerEvent.__tracker_name

        if (depName) {
          effect.__depList!.set(depName, depName)
        } else if (trackerEvent.$id) {
          effect.__depList!.set(String(event.key), String(event.key))
        }

        const depListStr = Array.from(effect.__depList!.keys()).join(', ')
        console.log(`[Vue Reactivity Tracker] watch(${depListStr})`)
      }
      effect.run() // 強制觸發一次 watch 來測試追蹤功能是否正常
    })
  }

  // 繼續往下找子組件
  walkVNode(instance.subTree)
}

export function walkVNode(vnode: VNode): void {
  if (!vnode) return
  if (vnode.component) {
    traverse(vnode.component as ExtendedComponentInstance) // 遞迴
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === 'object') walkVNode(child as VNode)
    })
  }
}
