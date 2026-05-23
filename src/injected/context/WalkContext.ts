import { basename } from '../helper/utils'
import type { GraphNode } from '../../graph/types'
import type { ExtendedComponentInstance, Data, WatchEffect } from '../../types/vue-internals'
import type { InstanceData } from './types'

export class WalkContext {
  valNodeMap: WeakMap<object, GraphNode> = new WeakMap()
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>> = new WeakMap()
  propSourceInjectMap: WeakMap<object, GraphNode> = new WeakMap()
  hmrOverrideMap: Map<string, ExtendedComponentInstance> = new Map()
  instanceChildPropKeyMap: WeakMap<
    object,
    Map<object, { maps: Map<string, string>[]; nextIndex: number }>
  > = new WeakMap()

  resolveComponentKey(
    parentPath: string | undefined,
    name: string,
    uid: number
  ): { key: string; name: string; path: string } {
    const path = parentPath ? `${parentPath}.${name}` : name

    return {
      key: uid.toString(),
      name: name,
      path,
    }
  }

  reset(): void {
    // 重建四個 WeakMap，保留 hmrOverrideMap
    this.valNodeMap = new WeakMap()
    this.propKeyNodeMap = new WeakMap()
    this.propSourceInjectMap = new WeakMap()
    this.instanceChildPropKeyMap = new WeakMap()
  }

  resolveInstance(instance: ExtendedComponentInstance): ExtendedComponentInstance {
    const hmrId = (instance?.type as any)?.__hmrId
    return hmrId && this.hmrOverrideMap.has(hmrId)
      ? this.hmrOverrideMap.get(hmrId)!
      : instance
  }
}

export function extractInstanceData(instance: ExtendedComponentInstance): InstanceData {
  const filePath = (instance.type as any).__file ?? ''
  const name =
    ((instance.type as any).__name as string) ||
    ((instance.type as any).name as string) ||
    'Anonymous'
  const file = basename(filePath) || 'Anonymous'

  const rawSetupState = instance.setupState?.['__v_raw'] || {}

  const watchEffects = instance.scope?.effects.filter((e) => e !== instance.effect) ?? []

  return {
    name,
    file,
    filePath,
    rawSetupState,
    watchEffects,
  }
}
