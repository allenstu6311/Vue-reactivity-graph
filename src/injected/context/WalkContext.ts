import type { GraphNode } from '../../graph/types'
import type { ExtendedComponentInstance, Data, WatchEffect } from '../../types/vue-internals'
import type { InstanceData } from './types'
import { getInstanceName } from '../helper/componentName'

export class WalkContext {
  /**
   * 【戶口名簿】ref/reactive/computed 的 **raw 物件** → 對應 GraphNode。
   * collectSetup 寫入；resolveChain、Phase 2 onTrack 靠它把 runtime 值反查回節點。
   */
  valNodeMap: WeakMap<object, GraphNode> = new WeakMap()
  /**
   * 【本層名冊】某實例的 **rawProps 容器** → (propName → 該 prop 的節點)。
   * collectProps 寫入；Phase 2 onTrack 時用 rawProps 反查回 prop 節點掛訂閱。
   */
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>> = new WeakMap()
  /**
   * 【戶口名簿】inject 進來的值（**raw 物件**）→ 對應 GraphNode。
   * collectInject 寫入；resolveChain 反查 prop 的 inject 來源。
   */
  propSourceInjectMap: WeakMap<object, GraphNode> = new WeakMap()
  /**
   * 【戶口名簿】節點 **id 字串**（如 `'5.obj'`）→ GraphNode。
   * 各 collector 經 registerNode 寫入；collectProps 拿 dry-run 給的來源 id 反查真節點。
   */
  nodeIdMap: Map<string, GraphNode> = new Map()
  /** HMR 用（與 prop 無關）：`__hmrId` → 最新的 component instance，熱更後解析到新實例。 */
  hmrOverrideMap: Map<string, ExtendedComponentInstance> = new Map()
  /**
   * 【偵察情報】父 instance → 該父層 dry-run 結果（即 sentinel.ts 的 `dryRunChildPropMap`）。
   * 內層：子組件物件 → `{ maps[]：同型多實例各一張 (propName→來源id); nextIndex：讀取游標 }`。
   * sentinel.ts 寫入；collectProps 以 `instance.parent` 取出（在那裡叫 `parentSentinelResult`）。
   */
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
    // 重建 WeakMap 和 Map，保留 hmrOverrideMap
    this.valNodeMap = new WeakMap()
    this.propKeyNodeMap = new WeakMap()
    this.propSourceInjectMap = new WeakMap()
    this.nodeIdMap = new Map()
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
  const name = getInstanceName(instance)

  const rawSetupState = instance.setupState?.['__v_raw'] || {}

  const watchEffects = instance.scope?.effects.filter((e) => e !== instance.effect) ?? []

  return {
    name,
    filePath,
    rawSetupState,
    watchEffects,
  }
}
