import type { ComponentInternalInstance, EffectScope, ReactiveEffect } from 'vue'
import type { GraphNode } from '../graph/types'

export type Data = Record<string, unknown>

// 被追蹤的響應式物件（ref、reactive、pinia store state）
export interface TrackedTarget {
  __vrg_depKey?: string
  __node?: GraphNode
  $id?: string // pinia store 識別碼
  [key: string | symbol]: unknown
}

export interface PiniaInstance {
  _s: Map<string, { $id: string; __v_raw?: Record<string, TrackedTarget> } & Record<string, TrackedTarget>>
}

// onTrack 的事件物件
export interface TrackEvent {
  target: TrackedTarget
  key: string | symbol
}

export type WatchEffect = ReactiveEffect

// Vue 內部 ComputedRefImpl（未公開 export）
export interface ComputedRefImpl {
  fn?: () => unknown
  effect?: object
  onTrack?: (event: TrackEvent) => void
  flags: number
  globalVersion: number
  _trackId?: number
  value: unknown
  __vrg_depKey?: string
}

// 擴充 EffectScope，加入 Vue 未公開的 effects 欄位
export interface ExtendedEffectScope extends EffectScope {
  effects: ReactiveEffect[]
}

// 擴充 ComponentInternalInstance，加入 Vue 未公開的內部欄位
export interface ExtendedComponentInstance extends ComponentInternalInstance {
  setupState: Data & { __v_raw?: Data }
  scope?: ExtendedEffectScope
  provides?: Data
  propsOptions: [Record<string, unknown>, string[]]
  parent: ExtendedComponentInstance | null
}

export interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null
  }
}
