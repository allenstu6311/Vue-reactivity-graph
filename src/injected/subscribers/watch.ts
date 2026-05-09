import type { WatchEffect } from "../../types/vue-internals"
import type { BindWatchTrackParams } from "./types"
import { createOnTrackHandler } from "./shared"

export function bindWatchTrack({
  nodes,
  watchEffects,
  componentName,
  rawSetupState,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: BindWatchTrackParams): void {
  watchEffects.forEach((effect: WatchEffect, index: number) => {
    const watchShortName = `w_${index}`
    const watchNode = nodes.find(
      (n) => n.type === "watch" && n.varName === watchShortName,
    )
    if (!watchNode) return

    const watchFullId = `${componentName}.${watchShortName}`

    effect.onTrack = createOnTrackHandler(watchNode, watchFullId, {
      componentName,
      rawSetupState,
      valNodeMap,
      propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    }) as any

    effect.run()
  })
}
