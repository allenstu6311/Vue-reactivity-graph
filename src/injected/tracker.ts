import type { RawSetupState, TrackEvent } from '../types/vue-internals'

export function trackSetupState(rawSetupState: RawSetupState): void {
  for (const key in rawSetupState) {
    const val = rawSetupState[key]
    val.__tracker_name = key

    if (val._rawValue && typeof val._rawValue === 'object') {
      val._rawValue.__tracker_name = key
    }
  }

  for (const key in rawSetupState) {
    const val = rawSetupState[key]

    // 是 computed
    if (val?.fn) {
      val.onTrack = (event: TrackEvent) => {
        // subscriber 的名稱：用 closure 捕捉的 key
        const subscriberName = key
        // dependency 的名稱：從之前標記的 __tracker_name 拿
        const depName = event.target.__tracker_name
        if (depName) {
          console.log(`[Vue Reactivity Tracker] ${subscriberName} 追蹤了 ${depName}`)
        } else if (event.target.$id) {
          // pinia store 的 state 沒有 __tracker_name，但有 $id 可以辨識是哪個 store
          console.log(`[Vue Reactivity Tracker] ${subscriberName} 追蹤了 ${String(event.key)}`)
        }
      }

      // 強制觸發 computed 重新計算，來測試追蹤功能是否正常
      val.flags |= 1 << 4  // 設 DIRTY
      val.flags &= ~(1 << 7) // 清除 EVALUATED
      val.globalVersion = -1  // 繞過 globalVersion fast path
      val.value
    }
  }
}
