import type { DebuggerEvent, VNode } from "vue";
import type {
  ExtendedComponentInstance,
  PiniaInstance,
  WatchEffect,
} from "../types/vue-internals";
import { bindSetupTrack } from "./tracker";
import { resolveDepNode, resolveDepName, isStoreToRefsRef } from "./helper/resolve";
import { GraphNode, updateGraph, getGraph, notifyUpdate } from "../graph";
import { WalkContext, extractInstanceData } from "./context/WalkContext";
import { runSentinelDryRun } from "./collect/sentinel";
import { collectProps } from "./collect/props";
import { collectInject } from "./collect/inject";
import { collectSetup, collectPiniaState } from "./collect/setup";
import { collectWatch } from "./collect/watch";

// Phase 1: 蒐集所有節點，不觸發任何訂閱者
export function collectInstance({
  rawInstance,
  parentComponentName,
  ctx,
}: {
  rawInstance: ExtendedComponentInstance
  parentComponentName?: string
  ctx: WalkContext
}): void {
  const instance = ctx.resolveInstance(rawInstance);
  const { file, rawSetupState, watchEffects } = extractInstanceData(instance);
  const propsOptions = instance.propsOptions?.[0];
  const parentRawSetupState = instance.parent?.setupState?.["__v_raw"];
  const componentName = ctx.resolveComponentName(parentComponentName, file);
  const nodes: GraphNode[] = [];

  // 1. run sentinel dry-run（寫入 ctx.instanceChildPropKeyMap，子層 collectProps 會讀）
  runSentinelDryRun({ instance, rawSetupState, propsOptions, ctx });

  // 2. collect props（Strategy 1 / 2 來源連結）
  collectProps({ instance, componentName, file, nodes, ctx, propsOptions, parentRawSetupState });

  // 3. collect inject（回傳 injectKeySet 供 setup 跳過同名 key）
  const injectKeys = collectInject({ instance, componentName, parentComponentName, file, nodes, ctx, rawSetupState });

  // 4. collect pinia（維持現況，每個 component 都呼叫）
  // 必須在 collectSetup 之前：storeToRefs 連結 store node 時需要 store node 已在 valNodeMap 中
  const pinia = instance.appContext.app.config.globalProperties.$pinia as PiniaInstance;
  collectPiniaState(pinia, nodes, ctx.valNodeMap);

  // 5. collect setup state（跳過 inject keys）
  const storeValToComponentNode = new Map<object, GraphNode>();
  collectSetup({ rawSetupState, componentName, file, nodes, valNodeMap: ctx.valNodeMap, skipKeys: injectKeys, storeValToComponentNode });

  // 6. collect watch
  collectWatch({ instance, componentName, file, nodes, watchEffects });

  updateGraph(componentName, nodes);
  // DFS：遞迴處理子元件樹，確保 DFS 順序維持不變
  collectVNode({ vnode: instance.subTree, parentComponentName: componentName, ctx });
}

export function collectVNode({
  vnode,
  parentComponentName,
  ctx,
}: {
  vnode: VNode
  parentComponentName?: string
  ctx: WalkContext
}): void {
  if (!vnode) return;
  if (vnode.component) {
    collectInstance({
      rawInstance: vnode.component as ExtendedComponentInstance,
      parentComponentName,
      ctx,
    });
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === "object")
        collectVNode({ vnode: child as VNode, parentComponentName, ctx });
    });
  }
}

// Phase 2: 觸發所有訂閱者，此時所有 node 已蒐集完畢
export function triggerInstance({
  rawInstance,
  parentComponentName,
  ctx,
}: {
  rawInstance: ExtendedComponentInstance
  parentComponentName?: string
  ctx: WalkContext
}): void {

  const instance = ctx.resolveInstance(rawInstance);

  const { file, rawSetupState, watchEffects } = extractInstanceData(instance);

  const componentName = ctx.resolveComponentName(parentComponentName, file);

  const nodes = getGraph()[componentName] ?? [];

  // per-component inject lookup：raw → injectNode，供 Phase 2 onTrack resolveDepNode 使用
  // 每次 triggerInstance 重建：A、B 兩個兄弟 component 若 inject 同一個 provide 值（同一 raw object），
  // 共用全域 Map 會互蓋，導致 A 的 onTrack 查到 B 的 injectNode，連線接錯對象
  const injectRawToLocalNode = new Map<object, GraphNode>();
  for (const node of nodes) {
    if (node.type !== "inject") continue;
    const raw = (node.val as any)?.__v_raw ?? node.val;
    if (raw && typeof raw === "object") {
      injectRawToLocalNode.set(raw as object, node);
    }
  }

  // per-component：重建 store 底層值 → component node 的對應（storeToRefs ref/reactive）
  // Phase 1 已將 ObjectRefImpl 建成 component node 並存入 valNodeMap
  // 此處透過 rawSetupState 重新取得 storeVal，還原 storeVal → componentNode 的查找
  const storeValToComponentNode = new Map<object, GraphNode>();
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    if (!val || typeof val !== "object") continue;
    if (!isStoreToRefsRef(val)) continue;
    const storeRaw = (val as any)._object?.__v_raw ?? (val as any)._object;
    const storeVal = storeRaw?.[(val as any)._key];
    const componentNode = ctx.valNodeMap.get(val as object);
    if (storeVal && typeof storeVal === "object" && componentNode) {
      storeValToComponentNode.set(storeVal as object, componentNode);
    }
  }
  if (rawSetupState) {
    bindSetupTrack({
      rawSetupState,
      componentName,
      valNodeMap: ctx.valNodeMap,
      propKeyNodeMap: ctx.propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    });
  }

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((effect: WatchEffect, index: number) => {
      const watchShortName = `w_${index}`;
      const watchNode = nodes.find(
        (n) => n.type === "watch" && n.varName === watchShortName,
      );
      if (!watchNode) return;

      const watchFullId = `${componentName}.${watchShortName}`;

      effect.onTrack = (event: DebuggerEvent) => {
        const depName = resolveDepName(
          event.target as object,
          event.key,
          ctx.propKeyNodeMap,
          ctx.valNodeMap,
        );
        if (!depName) return;

        const depNode = resolveDepNode({
          target: event.target as object,
          key: event.key,
          depName,
          rawSetupState,
          valNodeMap: ctx.valNodeMap,
          propKeyNodeMap: ctx.propKeyNodeMap,
          injectRawToLocalNode,
          storeValToComponentNode,
        });

        if (depNode) {
          if (!watchNode.deps.includes(depNode.id))
            watchNode.deps.push(depNode.id);
          if (!depNode.subs.includes(watchFullId))
            depNode.subs.push(watchFullId);
        }

        notifyUpdate();
      };
      effect.run();
    });
  }

  triggerVNode({ vnode: instance.subTree, parentComponentName: componentName, ctx });
}

export function triggerVNode({
  vnode,
  parentComponentName,
  ctx,
}: {
  vnode: VNode
  parentComponentName?: string
  ctx: WalkContext
}): void {
  if (!vnode) return;
  if (vnode.component) {
    triggerInstance({
      rawInstance: vnode.component as ExtendedComponentInstance,
      parentComponentName,
      ctx,
    });
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === "object")
        triggerVNode({ vnode: child as VNode, parentComponentName, ctx });
    });
  }
}
