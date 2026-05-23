import type { ExtendedComponentInstance, WatchEffect } from "../../types/vue-internals"
import type { GraphNode } from "../../graph"
import type { WalkContext } from "../context/WalkContext"

export interface CollectPropsParams {
  instance: ExtendedComponentInstance
  uid: number
  name: string
  path: string
  file: string
  filePath: string
  nodes: GraphNode[]
  ctx: WalkContext
  // propsOptions 由 orchestrator 傳入（sentinel dry-run 也需要同一份，在外層統一取）
  propsOptions: Record<string, unknown> | undefined
  // parentRawSetupState 顯式傳入，不讓 collectProps 自行從 instance.parent 取
  // 目的：明確表達 props 連結父層節點的事實，而非把父層依賴藏在函數內部
  parentRawSetupState: Record<string, unknown> | undefined
}

export interface CollectInjectParams {
  instance: ExtendedComponentInstance
  uid: number
  name: string
  path: string
  parent?: { uid: number; path: string }
  file: string
  filePath: string
  nodes: GraphNode[]
  ctx: WalkContext
  rawSetupState: Record<string, unknown>
}

export interface CollectSetupParams {
  rawSetupState: Record<string, unknown>
  uid: number
  name: string
  path: string
  file: string
  filePath: string
  nodes: GraphNode[]
  valNodeMap: WeakMap<object, GraphNode>   // 直接傳入，不包進 ctx
  skipKeys?: Set<string>                   // optional，與現行 CollectSetupStateParams 一致
  storeValToComponentNode: Map<object, GraphNode>
}

export interface CollectWatchParams {
  instance: ExtendedComponentInstance
  uid: number
  name: string
  path: string
  file: string
  filePath: string
  nodes: GraphNode[]
  watchEffects: WatchEffect[]
}

export interface SentinelDryRunParams {
  instance: ExtendedComponentInstance
  rawSetupState: Record<string, unknown>
  propsOptions: Record<string, unknown> | undefined
  ctx: WalkContext
}
