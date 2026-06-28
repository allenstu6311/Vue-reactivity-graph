import type { VNode } from "vue";
import type {
  ExtendedComponentInstance,
  PiniaInstance,
} from "../types/vue-internals";
import { bindComputedTrack } from "./subscribers/computed";
import { bindWatchTrack } from "./subscribers/watch";
import { isStoreToRefsRef } from "./helper/resolve";
import { GraphNode, updateComponent, updateNodes, updateStore, getGraphData, clearGraph } from "../graph";
import { WalkContext, extractInstanceData } from "./context/WalkContext";
import { runSentinelDryRun } from "./collect/sentinel";
import { collectProps } from "./collect/props";
import { collectInject } from "./collect/inject";
import { collectSetup, collectPiniaState } from "./collect/setup";
import { collectWatch } from "./collect/watch";
import { isObject } from "@/shared/helper/guards";

// Phase 1: 蒐集所有節點，不觸發任何訂閱者
export function collectInstance({
  rawInstance,
  parent,
  ctx,
}: {
  rawInstance: ExtendedComponentInstance
  parent?: { uid: number; path: string }
  ctx: WalkContext
}): void {
  const instance = ctx.resolveInstance(rawInstance);
  const { name, filePath, rawSetupState, watchEffects } = extractInstanceData(instance);
  const propsOptions = instance.propsOptions?.[0];
  const parentRawSetupState = instance.parent?.setupState?.["__v_raw"];
  const { key, path } = ctx.resolveComponentKey(parent?.path, name, instance.uid);
  const nodes: GraphNode[] = [];

  // 1. collect props（Strategy 1 / 2 來源連結）
  // 注：本 instance 的 collectProps 消費父層的 instanceChildPropKeyMap，不依賴本層 dry-run
  collectProps({ instance, uid: instance.uid, name, path, filePath, nodes, ctx, propsOptions, parentRawSetupState });

  // 2. collect inject（回傳 injectKeySet 供 setup 跳過同名 key）
  const injectKeys = collectInject({ instance, uid: instance.uid, name, path, parent, filePath, nodes, ctx, rawSetupState });

  // 3. collect setup state（跳過 inject keys）
  const storeValToComponentNode = new Map<object, GraphNode>();
  collectSetup({ rawSetupState, uid: instance.uid, name, path, filePath, nodes, valNodeMap: ctx.valNodeMap, skipKeys: injectKeys, storeValToComponentNode, ctx });

  // 4. collect watch
  collectWatch({ instance, uid: instance.uid, name, path, filePath, nodes, watchEffects, ctx });

  // 5. run sentinel dry-run（移到 collectInject + collectSetup 之後，此時 valNodeMap/propSourceInjectMap 已就緒）
  // 寫入 ctx.instanceChildPropKeyMap，供子層 collectProps 讀取
  runSentinelDryRun({ instance, rawSetupState, propsOptions, ctx });

  updateComponent(key, { uid: instance.uid, parentUid: parent?.uid, name, path, filePath });
  updateNodes(key, nodes);
  // DFS：遞迴處理子元件樹，確保 DFS 順序維持不變
  traverseVNode(instance.subTree, { uid: instance.uid, path }, ctx, collectInstance);
}

type InstanceVisitor = (params: {
  rawInstance: ExtendedComponentInstance
  parent?: { uid: number; path: string }
  ctx: WalkContext
}) => void

function traverseVNode(
  vnode: VNode,
  parent: { uid: number; path: string } | undefined,
  ctx: WalkContext,
  fn: InstanceVisitor,
): void {
  if (!vnode) return
  // component 與 children 兩分支必須互斥（少了 else 會重複遍歷）：
  //
  // - 碰到 component vnode：它畫出來的內容在 instance.subTree，fn → collectInstance 內部會遞迴
  //   subTree；傳進去的 slot 內容只要有被畫出來，也已經落在 subTree 裡。所以「畫出來的東西」都由
  //   subTree 涵蓋了，不需要再看 vnode.children（= 傳進去的 slot 原始 vnode）。若多看這一次，同一個
  //   子組件會被走兩次（曾導致第二趟蒐集到空 nodes、updateNodes 覆蓋掉第一趟、節點消失）。
  //
  // - children 分支是給「不是 component」的 vnode 用的（<div>、fragment、v-for 清單等）：它們沒有
  //   自己的 subTree，children 就是它們的內容。而 component 畫出來的 subTree 最外層往往就是 <div>
  //   這類標籤，要找到包在裡面的組件，就得靠這分支遞迴鑽進去——少了它，遍歷會卡在 <div> 出不去。
  if (vnode.component) fn({ rawInstance: vnode.component as ExtendedComponentInstance, parent, ctx })
  else if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (isObject(child)) traverseVNode(child as VNode, parent, ctx, fn)
    })
  }
}

// Phase 2: 觸發所有訂閱者，此時所有 node 已蒐集完畢
export function triggerInstance({
  rawInstance,
  parent,
  ctx,
}: {
  rawInstance: ExtendedComponentInstance
  parent?: { uid: number; path: string }
  ctx: WalkContext
}): void {

  const instance = ctx.resolveInstance(rawInstance);

  const { rawSetupState, watchEffects } = extractInstanceData(instance);

  const key = instance.uid.toString();

  const meta = getGraphData().components[key];
  const nodes = getGraphData().nodes[key] ?? [];

  // 每次 triggerInstance 重建，避免兄弟 component inject 同一個值時，A 的追蹤連到 B 的節點
  const injectRawToLocalNode = new Map<object, GraphNode>();
  for (const node of nodes) {
    if (node.type !== "inject") continue;
    const raw = (node.val as any)?.__v_raw ?? node.val;
    if (isObject(raw)) {
      injectRawToLocalNode.set(raw, node);
    }
  }

  // per-component：重建 store 底層值 → component node 的對應（storeToRefs ref/reactive）
  // Phase 1 已將 ObjectRefImpl 建成 component node 並存入 valNodeMap
  // 此處透過 rawSetupState 重新取得 storeVal，還原 storeVal → componentNode 的查找
  const storeValToComponentNode = new Map<object, GraphNode>();
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    if (!isObject(val)) continue;
    if (!isStoreToRefsRef(val)) continue;
    const storeRaw = (val as any)._object?.__v_raw ?? (val as any)._object;
    const storeVal = storeRaw?.[(val as any)._key];
    const componentNode = ctx.valNodeMap.get(val);
    if (isObject(storeVal) && componentNode) {
      storeValToComponentNode.set(storeVal, componentNode);
    }
  }
  if (rawSetupState) {
    bindComputedTrack({
      rawSetupState,
      uid: instance.uid,
      name: meta?.name ?? '',
      path: meta?.path ?? '',
      valNodeMap: ctx.valNodeMap,
      propKeyNodeMap: ctx.propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    });
  }

  if (watchEffects && watchEffects.length > 0) {
    bindWatchTrack({
      nodes,
      watchEffects,
      rawSetupState,
      valNodeMap: ctx.valNodeMap,
      propKeyNodeMap: ctx.propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    });
  }

  traverseVNode(instance.subTree, { uid: instance.uid, path: meta?.path ?? '' }, ctx, triggerInstance);
}

export function runScan(root: ExtendedComponentInstance, ctx: WalkContext): void {
  clearGraph()
  ctx.reset()

  const pinia = root.appContext?.app?.config?.globalProperties?.$pinia as PiniaInstance | undefined
  if (pinia) {
    const storeGroups = collectPiniaState(pinia, ctx.valNodeMap, ctx)
    for (const [storeId, nodes] of Object.entries(storeGroups)) {
      updateStore(storeId, nodes)
    }
  }
  // Phase 1: 建節點
  collectInstance({ rawInstance: root, ctx })

  // Phase 2: 掛 onTrack
  triggerInstance({ rawInstance: root, ctx })
}
