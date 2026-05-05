import { GraphNode, notifyUpdate } from "../graph";
import type {
  ComputedRefImpl,
  OnTrackEvent,
  Data,
  ReactiveTarget,
  PiniaInstance,
} from "../types/vue-internals";
import { buildNode, setValNode } from "./helper/nodes";
import { isStoreToRefsRef, isPiniaStoreProxy, resolveDepName, resolveDepNode } from "./helper/resolve";
import type { CollectSetupStateParams, BindSetupTrackParams } from "./helper/types";

function markComputedDirtyAndEval(val: ComputedRefImpl): void {
  val.flags |= 1 << 4;
  val.flags &= ~(1 << 7);
  val.globalVersion = -1;
  val.value;
}


// Phase 1: 建 node、存 valNodeMap
export function collectSetupState({
  rawSetupState,
  componentName,
  file,
  nodes,
  valNodeMap,
  skipKeys,
  storeValToComponentNode,
}: CollectSetupStateParams): void {
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue;
    const val = rawSetupState[key];

    if (typeof val !== "object" || val === null) continue;
    if (isPiniaStoreProxy(val)) continue;
    if (valNodeMap.has(val)) continue;
    const trackedVal = val as ReactiveTarget

    // storeToRefs ref/reactive wrapper（ObjectRefImpl）
    // _object 是 store proxy，_key 是屬性名，透過這兩個靜態建立 component node 與 store node 的連結
    if (isStoreToRefsRef(trackedVal)) {
      const storeRaw = (trackedVal as any)._object?.__v_raw ?? (trackedVal as any)._object;
      const storeKey = (trackedVal as any)._key;
      const storeVal = storeRaw?.[storeKey];
      const storeNode =
        storeVal && typeof storeVal === "object"
          ? valNodeMap.get(storeVal as object)
          : undefined;

      const componentNode = buildNode(key, trackedVal, componentName, file);
      if (componentNode && storeNode) {
        componentNode.deps.push(storeNode.id);
        if (!storeNode.subs.includes(componentNode.id))
          storeNode.subs.push(componentNode.id);
        storeValToComponentNode.set(storeVal as object, componentNode);
        valNodeMap.set(trackedVal, componentNode);
        nodes.push(componentNode);
      }
      continue;
    }

    const node = buildNode(key, trackedVal, componentName, file);
    if (node) {
      setValNode(valNodeMap, trackedVal, node);
      nodes.push(node);
    }
  }
}

export function collectPiniaState(
  pinia: PiniaInstance,
  nodes: GraphNode[],
  valNodeMap: WeakMap<object, GraphNode>,
): void {
  if (!pinia?._s) return;
  pinia._s.forEach((store) => {
    const storeId: string = store.$id;
    const raw = store.__v_raw ?? store;
    for (const key in raw) {
      if (key.startsWith("$") || key.startsWith("_")) continue;
      const val = raw[key];
      if (typeof val !== "object" || val === null) continue;
      const node: GraphNode = {
        id: `${storeId}.${key}`,
        varName: key,
        type: "store",
        val,
        file: storeId,
        deps: [],
        subs: [],
      };
      setValNode(valNodeMap, val, node);
      nodes.push(node);
    }
  });
}





// Phase 2: 設 onTrack + 觸發 computedImpl
export function bindSetupTrack({
  rawSetupState,
  componentName,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: BindSetupTrackParams): void {
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    const computedImpl = val as ComputedRefImpl

    if (computedImpl?.effect) {
      const subNode = valNodeMap.get(computedImpl as object);
      if (!subNode || subNode.type === "store") continue;

      computedImpl.onTrack = (event: OnTrackEvent) => {
        const subNode = valNodeMap.get(computedImpl as object)!;
        if (!subNode) return;

        // storeToRefs wrapper computedImpl 執行時會先存取 storeProxy 再存取 internal computedImpl
        // storeProxy 本身不是我們追蹤的節點，直接跳過，避免 setupStateVal 反查到自己
        // if (isPiniaStoreProxy(event.target as object)) return;

        const depName = resolveDepName(
          event.target as object,
          event.key,
          propKeyNodeMap,
          valNodeMap,
        );
        if (!depName) return;

        const depNode = resolveDepNode({
          target: event.target as object,
          key: event.key,
          depName,
          rawSetupState,
          valNodeMap,
          propKeyNodeMap,
          injectRawToLocalNode,
          storeValToComponentNode,
        });

        // depNode.id === subNode.id：storeToRefs wrapper 自我追蹤的防護
        if (!depNode || depNode.id === subNode.id) return;

        if (!subNode.deps.includes(depNode.id)) subNode.deps.push(depNode.id);

        // prop / inject 的 subs 需要完整的 component-scoped ID 才能跨 component 查找
        // 一般節點用 subNode.id（已含 componentName 前綴），不用 key（只是短名稱）
        const isPropOrInject =
          depNode.type === "prop" || depNode.type === "inject";
        const subName = isPropOrInject ? `${componentName}.${key}` : subNode.id;

        if (!depNode.subs.includes(subName)) depNode.subs.push(subName);
        notifyUpdate();
      };

      markComputedDirtyAndEval(computedImpl);
    }
  }
}
