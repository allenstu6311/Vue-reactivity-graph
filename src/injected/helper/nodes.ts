import type { GraphNode, NodeType } from "../../graph";
import type { ReactiveTarget } from "../../types/vue-internals";

export function getRaw<T>(val: T): T {
  return (val as any)?.__v_raw ?? val;
}

export function createNode(params: {
  id: string;
  varName: string;
  type: NodeType;
  val: unknown;
  filePath: string;
  name: string;
  uid?: number;
  path?: string;
  deps?: string[];
  subs?: string[];
}): GraphNode {
  return {
    ...params,
    deps: params.deps ?? [],
    subs: params.subs ?? [],
  };
}

export function setValNode(
  map: WeakMap<object, GraphNode>,
  val: object,
  node: GraphNode,
): void {
  map.set(val, node);
  const raw = getRaw(val);
  if (raw !== val && typeof raw === "object") map.set(raw as object, node);
}

export function detectNodeType(val: ReactiveTarget): NodeType | null {
  if (val?.effect) return "computed";
  if (val?.__v_isRef) return "ref";
  if (val?.setup) return "component";
  if (val.__v_isReactive) return "reactive";
  return null;
}
