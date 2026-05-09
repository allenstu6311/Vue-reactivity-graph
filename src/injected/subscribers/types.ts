import type { GraphNode } from "../../graph/types"
import type { WatchEffect } from "../../types/vue-internals"

export interface TriggerContext {
  componentName: string
  rawSetupState: Record<string, unknown>
  valNodeMap: WeakMap<object, GraphNode>
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>
  injectRawToLocalNode: Map<object, GraphNode>
  storeValToComponentNode: Map<object, GraphNode>
}

export interface BindComputedTrackParams extends TriggerContext {}

export interface BindWatchTrackParams extends TriggerContext {
  nodes: GraphNode[]
  watchEffects: WatchEffect[]
}
