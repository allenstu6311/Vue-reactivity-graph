import type { GraphNode } from "../../graph/types"
import type { WatchEffect } from "../../types/vue-internals"

export interface TriggerContext {
  uid: number
  name: string
  path: string
  rawSetupState: Record<string, unknown>
  valNodeMap: WeakMap<object, GraphNode>
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>
  injectRawToLocalNode: Map<object, GraphNode>
  storeValToComponentNode: Map<object, GraphNode>
}

export interface BindComputedTrackParams extends TriggerContext {}

export interface TrackContext {
  rawSetupState: Record<string, unknown>
  valNodeMap: WeakMap<object, GraphNode>
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>
  injectRawToLocalNode: Map<object, GraphNode>
  storeValToComponentNode: Map<object, GraphNode>
}

export interface BindWatchTrackParams extends TrackContext {
  nodes: GraphNode[]
  watchEffects: WatchEffect[]
}
