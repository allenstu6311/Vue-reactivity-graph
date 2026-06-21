import type { GraphNode, NodeType } from "../../graph";
import type { ReactiveTarget } from "../../types/vue-internals";
import { isObject } from "@/shared/helper/guards";

const MAX_DEPTH = 20
const MAX_ARRAY_SIZE = 5000
const MAX_STRING_SIZE = 10000

export function getRaw<T>(val: T): T {
  return (val as any)?.__v_raw ?? val;
}

function toRaw<T>(val: T): T {
  const raw = val && (val as any).__v_raw;
  return raw ? toRaw(raw) : val;
}

function isVueInstance(val: unknown): boolean {
  if (!isObject(val)) return false
  const v = val as Record<string, unknown>
  // 形態 a：內部 instance（ComponentInternalInstance）
  // 同時帶 vnode + subTree + uid（number）才命中
  if ('vnode' in v && 'subTree' in v && typeof v.uid === 'number') return true
  // 形態 b：public proxy（ComponentPublicInstance）
  // v._ 是 plain object 且含 vnode
  if (isObject(v._) && 'vnode' in (v._ as object)) return true
  return false
}

export function unref(val: unknown): unknown {
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

export function snapshot(val: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  // 1. depth 守門（最優先，防 stack overflow）
  if (depth > MAX_DEPTH) return '[MaxDepth]'

  // 兩種包裝都要剝：
  // - unref 把 ref/computed 變成裡面的值（避免遞迴進 Vue 內部結構）
  // - toRaw 把 reactive proxy 變成 raw target（避免觸發 proxy get trap / track）
  const raw = toRaw(unref(val))

  // 2. Vue instance 守門（在 toRaw(unref()) 之後）
  if (isObject(raw) && isVueInstance(raw)) return '[VueComponent]'

  if (!isObject(raw)) {
    // 3. BigInt 轉字串
    if (typeof raw === 'bigint') return `${raw}n`
    // 4. 字串長度守門
    if (typeof raw === 'string' && raw.length > MAX_STRING_SIZE)
      return `${raw.slice(0, MAX_STRING_SIZE)}... (${raw.length} total)`
    return raw
  }

  if (seen.has(raw)) return '[Circular]'
  seen.add(raw)

  if (Array.isArray(raw)) {
    // 5. 陣列大小守門
    if (raw.length > MAX_ARRAY_SIZE) {
      const sliced = raw.slice(0, MAX_ARRAY_SIZE).map(item => snapshot(item, seen, depth + 1))
      sliced.push(`... ${raw.length - MAX_ARRAY_SIZE} more items`)
      return sliced
    }
    return raw.map(item => snapshot(item, seen, depth + 1))
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('__v_')) continue
    out[key] = snapshot(value, seen, depth + 1)
  }
  return out
}
