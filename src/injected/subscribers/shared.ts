import type { GraphNode } from "../../graph/types"
import { notifyUpdate } from "../../graph"
import { resolveDepName, resolveDepNode } from "../helper/resolve"
import type { TriggerContext } from "./types"
import type { OnTrackEvent } from "../../types/vue-internals"

export function linkNodes(
  depNode: GraphNode,
  subNode: GraphNode,
  subId: string = subNode.id,
): void {
  if (!subNode.deps.includes(depNode.id)) subNode.deps.push(depNode.id)
  if (!depNode.subs.includes(subId)) depNode.subs.push(subId)
}

export function createOnTrackHandler(
  subNode: GraphNode,
  subId: string,
  ctx: TriggerContext,
  options: { guardSelf?: boolean } = {},
): (event: OnTrackEvent) => void {
  return (event) => {
    const depName = resolveDepName(event.target as object, event.key, ctx.propKeyNodeMap, ctx.valNodeMap)
    if (!depName) return

    const depNode = resolveDepNode({
      target: event.target as object,
      key: event.key,
      depName,
      rawSetupState: ctx.rawSetupState,
      valNodeMap: ctx.valNodeMap,
      propKeyNodeMap: ctx.propKeyNodeMap,
      injectRawToLocalNode: ctx.injectRawToLocalNode,
      storeValToComponentNode: ctx.storeValToComponentNode,
    })

    if (!depNode) return
    if (options.guardSelf && depNode.id === subNode.id) return

    linkNodes(depNode, subNode, subId)
    notifyUpdate()
  }
}
