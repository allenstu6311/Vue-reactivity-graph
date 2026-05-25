import type { ComputedRefImpl } from "../../types/vue-internals"
import type { BindComputedTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"
import { isStoreNode } from "../helper/nodes"

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
      // skip store-owned computed — they belong to Pinia, not this component
      if (!subNode || isStoreNode(subNode)) continue

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
    }
  }
}
