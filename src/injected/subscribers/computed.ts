import type { ComputedRefImpl } from "../../types/vue-internals"
import type { BindComputedTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"

function markComputedDirtyAndEval(val: ComputedRefImpl): void {
  val.flags |= 1 << 4
  val.flags &= ~(1 << 7)
  val.globalVersion = -1
  val.value
}

export function bindComputedTrack({
  rawSetupState,
  componentName,
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
      if (!subNode || subNode.type === "store") continue

      computedImpl.onTrack = createOnTrackHandler(subNode, subNode.id, {
        componentName,
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
