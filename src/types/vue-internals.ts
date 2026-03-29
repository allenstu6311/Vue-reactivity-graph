import type { ComponentInternalInstance, EffectScope, ReactiveEffect } from 'vue'
import type { DebuggerEvent } from 'vue'
import type { GraphNode } from '../graph/types'

/**
 * 目前因為會手動自己加key來協助判斷，所以先用any
 */
export type Data = Record<string, any>

// 被追蹤的響應式物件（ref、reactive、pinia store state）
export interface TrackedTarget {
  __vrg_depKey?: string
  __node?: GraphNode
  $id?: string // pinia store 識別碼
  [key: string | symbol]: unknown
}

// onTrack 的事件物件
export interface TrackEvent {
  target: TrackedTarget
  key: string | symbol
}

export type WatchEffects = ReactiveEffect

export type TrackerDebuggerEvent = DebuggerEvent & {
  __vrg_depKey?: string
  $id: string
}

// Vue 內部 ComputedRefImpl（未公開 export）
export interface ComputedRefImpl {
  fn?: () => unknown
  onTrack?: (event: TrackEvent) => void
  flags: number
  globalVersion: number
  _trackId?: number
  value: unknown
  __vrg_depKey?: string
  _rawValue?: TrackedTarget | null
}

// rawSetupState 的形狀（instance.setupState.__v_raw）
export type RawSetupState = Record<string, ComputedRefImpl>

// 擴充 EffectScope，加入 Vue 未公開的 effects 欄位
export interface ExtendedEffectScope extends EffectScope {
  effects: ReactiveEffect[]
}

// 擴充 ComponentInternalInstance，加入 Vue 未公開的內部欄位
export interface ExtendedComponentInstance extends ComponentInternalInstance {
  setupState: Data
  scope?: ExtendedEffectScope
  provides?: Data
  propsOptions: [Record<string, unknown>, string[]]
  parent: ExtendedComponentInstance | null
}

