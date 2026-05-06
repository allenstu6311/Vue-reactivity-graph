import type { GraphNode } from '../../graph/types'
import type { ExtendedComponentInstance, Data, WatchEffect } from '../../types/vue-internals'
import type { InstanceData } from './types'

export class WalkContext {
  valNodeMap: WeakMap<object, GraphNode> = new WeakMap()
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>> = new WeakMap()
  propSourceInjectMap: WeakMap<object, GraphNode> = new WeakMap()
  hmrOverrideMap: Map<string, ExtendedComponentInstance> = new Map()
  componentKeyCountMap: Map<string, number> = new Map()
  instanceChildPropKeyMap: WeakMap<
    object,
    Map<object, { maps: Map<string, string>[]; nextIndex: number }>
  > = new WeakMap()

  resolveComponentName(parentName: string | undefined, file: string): string {
    const undeduplicatedName = parentName ? `${parentName}.${file}` : file

    // 子組件重用
    const count = this.componentKeyCountMap.get(undeduplicatedName) ?? 0
    this.componentKeyCountMap.set(undeduplicatedName, count + 1)
    const componentName =
      count === 0 ? undeduplicatedName : `${undeduplicatedName}_${count}`

    return componentName
  }

  resetCounts(): void {
    this.componentKeyCountMap.clear()
  }

  resolveInstance(instance: ExtendedComponentInstance): ExtendedComponentInstance {
    const hmrId = (instance?.type as any)?.__hmrId
    return hmrId && this.hmrOverrideMap.has(hmrId)
      ? this.hmrOverrideMap.get(hmrId)!
      : instance
  }
}

export function extractInstanceData(instance: ExtendedComponentInstance): InstanceData {
  const file =
    ((instance.type as any).__name as string) ||
    ((instance.type as any).name as string) ||
    'Anonymous'

  const rawSetupState = instance.setupState?.['__v_raw'] || {}

  const watchEffects = instance.scope?.effects.filter((e) => e !== instance.effect) ?? []

  return {
    file,
    rawSetupState,
    watchEffects,
  }
}
