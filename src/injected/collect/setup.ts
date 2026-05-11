import { GraphNode } from "../../graph";
import type {
  ReactiveTarget,
  PiniaInstance,
} from "../../types/vue-internals";
import { buildNode, setValNode } from "../helper/nodes";
import { isStoreToRefsRef, isPiniaStoreProxy } from "../helper/resolve";
import { linkNodes } from "../subscribers/shared";
import type { CollectSetupParams } from "./types";

// Phase 1: 建 node、存 valNodeMap
export function collectSetup({
  rawSetupState,
  uid,
  name,
  path,
  file,
  nodes,
  valNodeMap,
  skipKeys,
  storeValToComponentNode,
}: CollectSetupParams): void {
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue; // inject keys — already built by collectInject
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

      const componentNode = buildNode(key, trackedVal, uid, name, path, file);
      if (componentNode && storeNode) {
        linkNodes(storeNode, componentNode);
        storeValToComponentNode.set(storeVal as object, componentNode);
        valNodeMap.set(trackedVal, componentNode);
        nodes.push(componentNode);
      }
      continue;
    }

    const node = buildNode(key, trackedVal, uid, name, path, file);
    if (node) {
      setValNode(valNodeMap, trackedVal, node);
      nodes.push(node);
    }
  }
}

export function collectPiniaState(
  pinia: PiniaInstance,
  valNodeMap: WeakMap<object, GraphNode>,
): Record<string, GraphNode[]> {
  const storeGroups: Record<string, GraphNode[]> = {};
  if (!pinia?._s) return storeGroups;
  pinia._s.forEach((store) => {
    const storeId: string = store.$id;
    const raw = store.__v_raw ?? store;
    const storeNodes: GraphNode[] = [];
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
      storeNodes.push(node);
    }
    if (storeNodes.length > 0) {
      storeGroups[storeId] = storeNodes;
    }
  });
  return storeGroups;
}
