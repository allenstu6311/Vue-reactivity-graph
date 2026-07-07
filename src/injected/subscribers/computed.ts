import type { ComputedRefImpl, PiniaInstance } from "../../types/vue-internals"
import type { BindComputedTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"
import { isStoreNode } from "../helper/nodes"
import type { GraphNode } from "../../graph"

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

export function bindPiniaGetterTrack(
  pinia: PiniaInstance,
  valNodeMap: WeakMap<object, GraphNode>,
): void {
  pinia._s?.forEach((store) => {
    const raw = store.__v_raw ?? store
    for (const key in raw) {
      const val = raw[key]
      const computedImpl = val as unknown as ComputedRefImpl
      if (!computedImpl?.effect) continue
      const subNode = valNodeMap.get(computedImpl as object)
      if (!subNode) continue

      computedImpl.onTrack = createOnTrackHandler(subNode, subNode.id, {
        rawSetupState: {},
        valNodeMap,
        propKeyNodeMap: new WeakMap(),
        injectRawToLocalNode: new Map(),
        storeValToComponentNode: new Map(),
      }, { guardSelf: true }) as any

      markComputedDirtyAndEval(computedImpl)
    }
  })
}
