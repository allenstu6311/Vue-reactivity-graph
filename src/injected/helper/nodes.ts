import type { GraphNode, NodeType } from "../../graph";
import type { ReactiveTarget } from "../../types/vue-internals";

export function getRaw<T>(val: T): T {
  return (val as any)?.__v_raw ?? val;
}

export function makeNode(
  id: string,
  varName: string,
  type: NodeType,
  val: unknown,
  file: string,
): GraphNode {
  return { id, varName, type, val, file, deps: [], subs: [] };
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

export function buildNode(
  key: string,
  val: ReactiveTarget,
  componentName: string,
  file: string,
): GraphNode | null {
  const id = `${componentName}.${key}`;

  if (val?.effect) {
    return makeNode(id, key, "computed", val, file);
  }

  if (val?.__v_isRef) {
    return makeNode(id, key, "ref", val, file);
  }

  if (val?.setup) {
    return makeNode(id, key, "component", val, file);
  }

  if (val.__v_isReactive) {
    const snapshot = Object.fromEntries(
      Object.entries(val as unknown as Record<string, unknown>).filter(
        ([k]) => !k.startsWith("__v_"),
      ),
    );

    return makeNode(id, key, "reactive", snapshot, file);
  }
  return null;
}
