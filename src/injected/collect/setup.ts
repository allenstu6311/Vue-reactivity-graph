import { GraphNode } from "../../graph";
import type {
  ReactiveTarget,
  PiniaInstance,
} from "../../types/vue-internals";
import { detectNodeType, createNode, setValNode, registerNode } from "../helper/nodes";
import { isStoreToRefsRef, isPiniaStoreProxy } from "../helper/resolve";
import { linkNodes } from "../subscribers/shared";
import type { CollectSetupParams } from "./types";
import type { WalkContext } from "../context/WalkContext";
import { isObject } from "@/shared/helper/guards";

// Phase 1: 建 node、存 valNodeMap
export function collectSetup(
  params: CollectSetupParams & { ctx: WalkContext }
): void {
  const {
    rawSetupState,
    uid,
    name,
    path,
    filePath,
    nodes,
    valNodeMap,
    skipKeys,
    storeValToComponentNode,
    ctx,
  } = params;
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue; // inject keys — already built by collectInject
    const val = rawSetupState[key];

    if (!isObject(val)) continue;
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
        isObject(storeVal)
          ? valNodeMap.get(storeVal as object)
          : undefined;

      const type = detectNodeType(trackedVal);
      if (!type) continue;
      const componentNode = createNode({ id: `${uid}.${key}`, varName: key, type, val: trackedVal, filePath, name, uid, path });
      if (componentNode && storeNode) {
        linkNodes(storeNode, componentNode);
        storeValToComponentNode.set(storeVal as object, componentNode);
        valNodeMap.set(trackedVal, componentNode);
        registerNode(nodes, ctx, componentNode);
      }
      continue;
    }

    const type = detectNodeType(trackedVal);
    if (!type) continue;
    const node = createNode({ id: `${uid}.${key}`, varName: key, type, val: trackedVal, filePath, name, uid, path });
    setValNode(valNodeMap, trackedVal, node);
    registerNode(nodes, ctx, node);
  }
}

export function collectPiniaState(
  pinia: PiniaInstance,
  valNodeMap: WeakMap<object, GraphNode>,
  ctx: WalkContext,
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
      if (!isObject(val)) continue;
      const subtype = detectNodeType(val as ReactiveTarget) ?? undefined;
      const node = createNode({
        id: `${storeId}.${key}`,
        varName: key,
        type: "store",
        subtype,
        val,
        name: storeId,
        filePath: '',
      });
      setValNode(valNodeMap, val, node);
      storeNodes.push(node);
      ctx.nodeIdMap.set(node.id, node);
    }
    if (storeNodes.length > 0) {
      storeGroups[storeId] = storeNodes;
    }
  });
  return storeGroups;
}
