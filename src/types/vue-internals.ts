import type { ComponentInternalInstance, ComponentPublicInstance, EffectScope, ReactiveEffect, VNode, VNodeChild, VNodeTypes } from 'vue'
import type { GraphNode } from '../graph/types'

export type Data = Record<string | symbol, unknown>

// 被追蹤的響應式物件（ref、reactive、pinia store state）
export interface ReactiveTarget {
  __node?: GraphNode
  $id?: string // pinia store 識別碼
  [key: string | symbol]: unknown
}

export interface PiniaInstance {
  _s: Map<string, { $id: string; __v_raw?: Record<string, ReactiveTarget> } & Record<string, ReactiveTarget>>
}

// onTrack 的事件物件
export interface OnTrackEvent {
  target: ReactiveTarget
  key: string | symbol
}

export type WatchEffect = ReactiveEffect

// Vue 內部 ComputedRefImpl（未公開 export）
export interface ComputedRefImpl {
  fn?: () => unknown
  effect?: object
  onTrack?: (event: OnTrackEvent) => void
  flags: number
  globalVersion: number
  _trackId?: number
  value: unknown
}

// 擴充 EffectScope，加入 Vue 未公開的 effects 欄位
export interface ExtendedEffectScope extends EffectScope {
  effects: ReactiveEffect[]
}

export type InternalRenderFunction = {
  (
    ctx: ComponentPublicInstance,
    cache: ExtendedComponentInstance['renderCache'],
    // for compiler-optimized bindings
    $props: ExtendedComponentInstance['props'],
    $setup: ExtendedComponentInstance['setupState'],
    $data: ExtendedComponentInstance['data'],
    $options: ExtendedComponentInstance['ctx'],
  ): VNodeChild
  _rc?: boolean // isRuntimeCompiled

  // __COMPAT__ only
  _compatChecked?: boolean // v3 and already checked for v2 compat
  _compatWrapped?: boolean // is wrapped for v2 compat
}

// 擴充 ComponentInternalInstance，加入 Vue 未公開的內部欄位
export interface ExtendedComponentInstance extends ComponentInternalInstance {
  setupState: Data & { __v_raw?: Data }
  scope?: ExtendedEffectScope
  provides?: Data
  propsOptions: [Record<string, unknown>, string[]]
  parent: ExtendedComponentInstance | null
  render: InternalRenderFunction | null
  renderCache: (Function | VNode | undefined)[]
  ctx: Data
  withProxy: ComponentPublicInstance | null
  proxy: ComponentPublicInstance | null
}
export interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null
  }
}

// sentinel dry-run 期間的 VNode：type 可能是 sentinel Symbol 或 Vue 內建 Symbol（Fragment/Text/Comment）
// props 可能是 sentinel Symbol（v-bind="someObj" 整包展開）
export type SentinelVNode = Omit<VNode, 'type' | 'props'> & {
  type?: VNodeTypes | symbol
  props?: Record<string, unknown> | symbol | null
}

export interface RawAppContext {
  components?: Record<string, unknown>
}

export type HookComponentEventArgs = [
  vueApp: { _instance: ExtendedComponentInstance },
  unknown,
  unknown,
  instance: ExtendedComponentInstance,
]
