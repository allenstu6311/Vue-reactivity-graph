import type { ComponentInternalInstance, EffectScope, ReactiveEffect } from 'vue'
import type { DebuggerEvent } from 'vue'

// 被追蹤的響應式物件（ref、reactive、pinia store state）
export interface TrackedTarget {
  __tracker_name?: string
  $id?: string // pinia store 識別碼
  [key: string | symbol]: unknown
}

// onTrack 的事件物件
export interface TrackEvent {
  target: TrackedTarget
  key: string | symbol
}

// Vue 內部 ReactiveEffect（未公開 export）
// export interface ReactiveEffect {
//   onTrack?: (event: TrackEvent) => void
//   run(): unknown
//   // 我們自行附加的屬性
//   __depList?: Map<string, string>
// }
export type WatchEffects = ReactiveEffect

export type TrackerDebuggerEvent = DebuggerEvent & {
  __tracker_name?: string
  $id: string
}

// Vue 內部 ComputedRefImpl（未公開 export）
export interface ComputedRefImpl {
  fn?: () => unknown
  onTrack?: (event: TrackEvent) => void
  flags: number
  globalVersion: number
  value: unknown
  __tracker_name?: string
  _rawValue?: TrackedTarget | null
}

// rawSetupState 的形狀（instance.setupState.__v_raw）
export type RawSetupState = Record<string, ComputedRefImpl>

// 擴充 EffectScope，加入 Vue 未公開的 effects 欄位
export interface ExtendedEffectScope extends EffectScope {
  effects: WatchEffects[]
}

// 擴充 ComponentInternalInstance，加入 Vue 未公開的內部欄位
export interface ExtendedComponentInstance extends ComponentInternalInstance {
  setupState: Record<string, unknown> & { __v_raw?: RawSetupState }
  scope?: ExtendedEffectScope
  // effect?: ReactiveEffect
  // subTree: VNode
  // type: {
  //   __name?: string
  //   [key: string]: unknown
  // }
}

