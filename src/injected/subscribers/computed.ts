import type { ComputedRefImpl } from "../../types/vue-internals"
import type { BindComputedTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"
import { isStoreNode } from "../helper/nodes"

// 強制 computed 重新求值一次，讓 getter 同步執行 → 觸發 onTrack → 當場捕捉 deps。
// 三個寫入分別穿過 refreshComputed 的三道早退閘門（@vue/reactivity 3.5）：
//   flags |= DIRTY(1<<4)      → 穿過「未 dirty 就跳過」
//   flags &= ~EVALUATED(1<<7) → 穿過「已評估就跳過」
//   globalVersion = -1        → 穿過「全域版本未變就跳過」
// 缺任一行，已被 app 求值過的 computed 讀 .value 只會回快取：getter 不重跑、onTrack 不觸發、deps 抓不到。
function markComputedDirtyAndEval(val: ComputedRefImpl): void {
  val.flags |= 1 << 4
  val.flags &= ~(1 << 7)
  val.globalVersion = -1
  val.value
}

export function bindComputedTrack({
  rawSetupState,
  uid,
  name,
  path,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: BindComputedTrackParams): void {
  for (const key in rawSetupState) {
    const val = rawSetupState[key]
    const computedImpl = val as ComputedRefImpl

    if (computedImpl?.effect) {
      const subNode = valNodeMap.get(computedImpl as object)
      // 略過 store 持有的 computed：它們屬於 Pinia，不屬於這個 component
      if (!subNode || isStoreNode(subNode)) continue

      // 掛 onTrack → 強制求值（deps 在此同步捕捉完）→ 立刻拆掉。這三步是一組，缺一不可：
      //   不強制求值 → 讀 .value 命中快取，getter 不重跑，deps 抓不到；
      //   不拆掉 onTrack → handler 常駐，app 之後每次響應式活動都會觸發它 → 全量 refresh → 持續燒 CPU。
      computedImpl.onTrack = createOnTrackHandler(subNode, subNode.id, {
        uid,
        name,
        path,
        rawSetupState,
        valNodeMap,
        propKeyNodeMap,
        injectRawToLocalNode,
        storeValToComponentNode,
      }, { guardSelf: true }) as any

      markComputedDirtyAndEval(computedImpl)

      // computedImpl.onTrack = undefined as any
    }
  }
}
