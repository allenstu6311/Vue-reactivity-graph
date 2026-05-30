import type { GraphNode, NodeType } from "../../graph";
import type { ReactiveTarget } from "../../types/vue-internals";
import { isObject } from "./guards";

export function getRaw<T>(val: T): T {
  return (val as any)?.__v_raw ?? val;
}

function toRaw<T>(val: T): T {
  const raw = val && (val as any).__v_raw;
  return raw ? toRaw(raw) : val;
}

function unref(val: unknown): unknown {
  if (isObject(val) && (val as any).__v_isRef === true) {
    const inner = (val as any).effect
      ? (val as any).value        // computed：強制觸發 getter
      : (val as any)._value       // plain ref：讀私有欄位
    return unref(inner)
  }
  return val
}

export function createNode(params: {
  id: string;
  varName: string;
  type: NodeType;
  subtype?: NodeType;
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
  if (raw !== val && isObject(raw)) map.set(raw as object, node);
}

export function detectNodeType(val: ReactiveTarget): NodeType | null {
  if (val?.effect) return "computed";
  if (val?.__v_isRef) return "ref";
  if (val?.__v_isReactive) return "reactive";
  return null;
}

export const isStoreNode = (node: GraphNode): boolean => node.type === "store";

export function snapshot(val: unknown, seen = new WeakSet<object>()): unknown {
  // 兩種包裝都要剝：
  // - unref 把 ref/computed 變成裡面的值（避免遞迴進 Vue 內部結構）
  // - toRaw 把 reactive proxy 變成 raw target（避免觸發 proxy get trap / track）
  const raw = toRaw(unref(val))

  if (!isObject(raw)) return raw
  if (seen.has(raw)) return '[Circular]'
  seen.add(raw)

  if (Array.isArray(raw)) {
    return raw.map(item => snapshot(item, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('__v_')) continue
    out[key] = snapshot(value, seen)
  }
  return out
}
