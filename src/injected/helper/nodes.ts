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
  filePath: string,
  name: string,
  uid?: number,
  path?: string,
): GraphNode {
  return { id, varName, type, val, filePath, name, deps: [], subs: [], uid, path };
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
  uid: number,
  name: string,
  path: string,
  filePath: string,
): GraphNode | null {
  const id = `${uid}.${key}`;

  if (val?.effect) {
    return makeNode(id, key, "computed", val, filePath, name, uid, path);
  }

  if (val?.__v_isRef) {
    return makeNode(id, key, "ref", val, filePath, name, uid, path);
  }

  if (val?.setup) {
    return makeNode(id, key, "component", val, filePath, name, uid, path);
  }

  if (val.__v_isReactive) {
    const snapshot = Object.fromEntries(
      Object.entries(val as unknown as Record<string, unknown>).filter(
        ([k]) => !k.startsWith("__v_"),
      ),
    );

    return makeNode(id, key, "reactive", snapshot, filePath, name, uid, path);
  }
  return null;
}
