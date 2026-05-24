import type { CollectInjectParams } from "./types";
import type { GraphNode } from "../../graph";
import { getGraphData } from "../../graph";
import { createNode } from "../helper/nodes";
import { linkNodes } from "../subscribers/shared";

// DFS 時序契約：anonymous provide node 建立後直接寫入 getGraphData().components[parent!.uid.toString()]。
// 此陣列由父層 updateComponent(parent!.uid.toString(), nodes) 建立——DFS 保證父層 collectInstance
// 完整執行完才輪到子層。
//
// 若順序被破壞（子層先於父層執行）：
//   getGraphData().components[parent!.uid.toString()] 為 undefined → ?.push() 靜默 no-op，不拋錯。
//   anonymous node 不會進入父層 graph，但 valNodeMap 寫入仍成功（ctx.valNodeMap.set 正常執行）。
//   後果：Phase 2 的 resolveDepNode 仍可從 valNodeMap 找到這個 node，
//   但 DevTools panel 渲染的父層節點清單會缺少此 anonymous node——圖形不完整且難以察覺。
//
// anonymous node 建立後需同時執行三個寫入（維持現況行為）：
//   1. getGraphData().components[parent!.uid.toString()]?.push(parentNode)
//   2. ctx.valNodeMap.set(lookupKey, parentNode)
//   3. ctx.propSourceInjectMap.set(injectRaw, injectNode)
export function collectInject(params: CollectInjectParams): Set<string> {
  const { instance, uid, name, path, parent, filePath, nodes, ctx, rawSetupState } = params;

  const injectKeySet = new Set<string>();
  const parentProvides = instance.parent?.provides;

  if (!parentProvides) return injectKeySet;

  // 先建 raw → parentNode 的 lookup，避免雙層 for...in
  const provideRawToNode = new Map<object, GraphNode>();
  const provideKeys: (string | symbol)[] = [
    ...Object.keys(parentProvides as object),
    ...Object.getOwnPropertySymbols(parentProvides as object),
  ];
  const parentFilePath = (instance.parent?.type as any)?.__file ?? '';
  const parentComponentName =
    (instance.parent?.type as any)?.__name ||
    (instance.parent?.type as any)?.name ||
    'Anonymous';

  for (const key of provideKeys) {
    const val = parentProvides[key];
    if (typeof val !== "object" || val === null) continue;
    const raw = (val as any).__v_raw;
    const lookupKey = (raw && typeof raw === "object" ? raw : val) as object;
    let parentNode =
      (raw && typeof raw === "object" ? ctx.valNodeMap.get(raw as object) : undefined) ??
      ctx.valNodeMap.get(val as object);

    if (!parentNode) {
      const keyStr =
        typeof key === "symbol"
          ? `anonymous:${key.description ?? "symbol"}`
          : `anonymous:${String(key)}`;
      parentNode = createNode({
        id: `${parent!.uid}.${keyStr}`,
        uid: parent!.uid,
        name: parentComponentName,
        path: parent!.path,
        varName: "anonymous",
        type: (val as any).__v_isRef ? "ref" : "reactive",
        val: lookupKey,
        filePath: parentFilePath,
      });
      getGraphData().components[parent!.uid.toString()]?.push(parentNode);
      ctx.valNodeMap.set(lookupKey, parentNode);
    }

    provideRawToNode.set(val, parentNode);
  }

  if (provideRawToNode.size > 0) {
    for (const childKey in rawSetupState) {
      const val = rawSetupState[childKey];
      if (typeof val !== "object" || val === null) continue;
      const parentNode = provideRawToNode.get(val as object);

      if (!parentNode) continue;
      injectKeySet.add(childKey);
      const injectNode = createNode({
        id: `${uid}.${childKey}`,
        uid,
        name,
        path,
        varName: childKey,
        type: "inject",
        val: (val as any).__v_raw ?? val,
        filePath,
      });
      linkNodes(parentNode, injectNode);
      nodes.push(injectNode);
      const injectRaw = (val as any).__v_raw ?? val;
      ctx.propSourceInjectMap.set(injectRaw as object, injectNode);
    }
  }

  return injectKeySet;
}
