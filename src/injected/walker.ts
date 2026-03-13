import type { DebuggerEvent, VNode } from "vue";
import type {
  ExtendedComponentInstance,
  WatchEffects,
  TrackerDebuggerEvent,
} from "../types/vue-internals";
import {
  collectSetupState,
  bindSetupTrack,
  valNodeMap,
  propKeyNodeMap,
} from "./tracker";
import { GraphNode, updateGraph, getGraph, notifyUpdate } from "../types/graph";

// Phase 1: 蒐集所有節點，不觸發任何訂閱者
export function collectInstance(
  instance: ExtendedComponentInstance,
  prevComponentName?: string,
): void {
  const componentName = prevComponentName
    ? `${prevComponentName}.${instance?.type?.__name || "Unknown"}`
    : instance?.type?.__name || "Unknown";
  const file =
    ((instance.type as Record<string, unknown>).__name as string) ?? "";
  const nodes: GraphNode[] = [];

  const rawSetupState = instance.setupState?.["__v_raw"] || {};
  const parentRawSetupState = instance.parent?.setupState?.["__v_raw"];
  const propsOptions = instance.propsOptions?.[0];

  // Props 追蹤：建 prop nodes + 存進 propKeyNodeMap
  if (propsOptions) {
    const rawPropsObj = ((instance.props as any).__v_raw ??
      instance.props) as object;
    const propMap = new Map<string, GraphNode>();
    propKeyNodeMap.set(rawPropsObj, propMap);

    for (const propKey in propsOptions) {
      const propNode: GraphNode = {
        id: `${componentName}.${propKey}`,
        varName: propKey,
        type: "prop",
        val: (instance.props as Record<string, unknown>)[propKey],
        file,
        deps: [],
        subs: [],
      };
      nodes.push(propNode);
      propMap.set(propKey, propNode);

      // 連結父層 node（父層已在 Phase 1 先被蒐集）
      if (parentRawSetupState) {
        const parentVal = parentRawSetupState[propKey];
        if (parentVal && typeof parentVal === "object") {
          const parentNode = valNodeMap.get(parentVal);
          if (parentNode) {
            propNode.deps.push(parentNode.id);
            // console.log('parentNode', parentNode)
            // console.log('propNode', propNode)
            if (!parentNode.subs.includes(propNode.id)) {
              parentNode.subs.push(propNode.id);
            }
          }
        }
      }
    }
  }

  if (rawSetupState) {
    collectSetupState(rawSetupState, componentName, file, nodes);
  }

  // 建 watch nodes（不觸發 effect）
  const watchEffects = instance.scope?.effects.filter(
    (e) => e !== instance.effect,
  );

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((_effect: WatchEffects, index: number) => {
      nodes.push({
        id: `${componentName}.w_${index}`,
        varName: `w_${index}`,
        type: "watch",
        val: null,
        file,
        deps: [],
        subs: [],
      });
    });
  }

  updateGraph(componentName, nodes);
  collectVNode(instance.subTree, componentName);
}

export function collectVNode(vnode: VNode, prevComponentName?: string): void {
  if (!vnode) return;
  if (vnode.component) {
    collectInstance(
      vnode.component as ExtendedComponentInstance,
      prevComponentName,
    );
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === "object")
        collectVNode(child as VNode, prevComponentName);
    });
  }
}

// Phase 2: 觸發所有訂閱者，此時所有 node 已蒐集完畢
export function triggerInstance(
  instance: ExtendedComponentInstance,
  prevComponentName?: string,
): void {
  const componentName = prevComponentName
    ? `${prevComponentName}.${instance?.type?.__name || "Unknown"}`
    : instance?.type?.__name || "Unknown";

  const rawSetupState = instance.setupState?.["__v_raw"] || {};
  const nodes = getGraph()[componentName] ?? [];

  if (rawSetupState) {
    bindSetupTrack(rawSetupState, componentName);
  }

  const watchEffects = instance.scope?.effects.filter(
    (e) => e !== instance.effect,
  );

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((effect: WatchEffects, index: number) => {
      const watchShortName = `w_${index}`;
      const watchNode = nodes.find(
        (n) => n.type === "watch" && n.varName === watchShortName,
      );
      if (!watchNode) return;

      effect.onTrack = (event: DebuggerEvent) => {
        const trackerEvent = event.target as TrackerDebuggerEvent;
        const depName =
          trackerEvent.__tracker_name ??
          (trackerEvent.$id ? String(event.key) : undefined);
        if (!depName) return;

        if (!watchNode.deps.includes(depName)) {
          watchNode.deps.push(depName);
        }

        const depNode =
          valNodeMap.get(event.target as object) ||
          valNodeMap.get(rawSetupState[depName] as object) ||
          propKeyNodeMap.get(event.target as object)?.get(String(event.key));

        if (depNode && !depNode.subs.includes(watchShortName)) {
          depNode.subs.push(watchShortName);
        }

        notifyUpdate();
      };

      effect.run();
    });
  }

  triggerVNode(instance.subTree, componentName);
}

export function triggerVNode(vnode: VNode, prevComponentName?: string): void {
  if (!vnode) return;
  if (vnode.component) {
    triggerInstance(
      vnode.component as ExtendedComponentInstance,
      prevComponentName,
    );
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === "object")
        triggerVNode(child as VNode, prevComponentName);
    });
  }
}
