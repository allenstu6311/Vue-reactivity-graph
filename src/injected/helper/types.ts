import type { GraphNode } from "../../graph";
import type { Data } from "../../types/vue-internals";

export interface CollectSetupStateParams {
  rawSetupState: Data;
  componentName: string;
  file: string;
  nodes: GraphNode[];
  valNodeMap: WeakMap<object, GraphNode>;
  skipKeys?: Set<string>;
  storeValToComponentNode: Map<object, GraphNode>;
}

export interface ResolveDepNodeParams {
  target: object;
  key: string | symbol;
  depName: string | undefined;
  rawSetupState: object | undefined;
  valNodeMap: WeakMap<object, GraphNode>;
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>;
  injectRawToLocalNode: Map<object, GraphNode>;
  storeValToComponentNode?: Map<object, GraphNode>;
}

export interface BindSetupTrackParams {
  rawSetupState: Data;
  componentName: string;
  valNodeMap: WeakMap<object, GraphNode>;
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>;
  injectRawToLocalNode: Map<object, GraphNode>;
  storeValToComponentNode: Map<object, GraphNode>;
}

// 供 collect/ 各模組使用的共用參數基底
export interface BaseCollectParams {
  componentName: string;
  file: string;
  nodes: GraphNode[];
  valNodeMap: WeakMap<object, GraphNode>;
}
