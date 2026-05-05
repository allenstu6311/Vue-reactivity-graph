import type { GraphNode } from "../../graph";
import type { ResolveDepNodeParams } from "./types";

export function isPiniaStoreProxy(val: unknown): boolean {
  return (
    typeof (val as any)?.$id === "string" &&
    typeof (val as any)?.$patch === "function"
  );
}

// storeToRefs 產生的 ObjectRefImpl：_key 是屬性名，_object 是 store proxy
export function isStoreToRefsRef(val: unknown): boolean {
  return (
    (val as any)?._key !== undefined && isPiniaStoreProxy((val as any)?._object)
  );
}

export function resolveDepName(
  target: object,
  key: string | symbol,
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>,
  valNodeMap: WeakMap<object, GraphNode>,
): string | undefined {
  return (
    (isPiniaStoreProxy(target) ? String(key) : undefined) ??
    valNodeMap.get(target)?.varName ??
    (propKeyNodeMap.has(target) ? String(key) : undefined)
  );
}

export function resolveDepNode({
  target,
  key,
  depName,
  rawSetupState,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: ResolveDepNodeParams): GraphNode | undefined {
  const setupStateVal =
    depName && rawSetupState
      ? (rawSetupState as Record<string, unknown>)[depName]
      : undefined;

  return (
    // storeToRefs ref/reactive wrapper：store 底層值 → component node（優先於 valNodeMap 的 store node）
    storeValToComponentNode?.get(target) ||
    // target 是當前 component 的 inject 值；per-component 區域 Map，不污染全域 valNodeMap
    injectRawToLocalNode.get(target) ||
    // target 就是響應式物件本身（ref / reactive / computedImpl / pinia store 內部值）
    valNodeMap.get(target) ||
    // Pinia store fallback：target 是 rawStore，改用 rawSetupState[depName] 查 valNodeMap
    (setupStateVal && typeof setupStateVal === "object"
      ? valNodeMap.get(setupStateVal as object)
      : undefined) ||
    // target 是 raw props object；prop 值可能是 primitive 無法當 WeakMap key，所以另開兩層結構
    propKeyNodeMap.get(target)?.get(String(key))
  );
}
