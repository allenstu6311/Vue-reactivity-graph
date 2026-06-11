import type { WatchEffect } from "../../types/vue-internals"
import type { BindWatchTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"

export function bindWatchTrack({
  nodes,
  watchEffects,
  rawSetupState,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: BindWatchTrackParams): void {
  // 從 nodes 陣列過濾 watch 節點
  const watchNodes = nodes.filter((n) => n.type === "watch")

  watchEffects.forEach((effect: WatchEffect, index: number) => {
    const watchNode = watchNodes[index]
    if (!watchNode) return

    // 掛 onTrack → effect.run() 觸發求值（deps 在此同步捕捉完）→ 立刻拆掉，避免 handler 常駐燒 CPU
    effect.onTrack = createOnTrackHandler(watchNode, watchNode.id, {
      rawSetupState,
      valNodeMap,
      propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    }) as any
    effect.run()
    // effect.onTrack = undefined as any
  })
}
