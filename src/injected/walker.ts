import type { DebuggerEvent, VNode } from "vue";
import type {
  ExtendedComponentInstance,
  WatchEffects,
  TrackerDebuggerEvent,
} from "../types/vue-internals";
import { trackSetupState, valNodeMap } from "./tracker";
import { GraphNode, updateGraph, notifyUpdate } from "../types/graph";

export function traverse(
  instance: ExtendedComponentInstance,
  prevComponentName?: string | undefined,
): void {
  const componentName = prevComponentName
    ? `${prevComponentName}.${instance?.type?.__name || "Unknown"}`
    : instance?.type?.__name || "Unknown";
  // console.log("instance", instance);
  const file =
    ((instance.type as Record<string, unknown>).__name as string) ?? "";
  const nodes: GraphNode[] = [];

  const rawSetupState = instance.setupState?.["__v_raw"] || {};

  /**
   * #issue
   * 須自己處理 parent setupState 的型別
   */
  const parentRawSetupState = instance.parent?.setupState?.["__v_raw"];
  const propsOptions = instance.propsOptions?.[0];

  // Props 追蹤：在 trackSetupState 前執行，此時父層 node 仍在 valNodeMap 可查到
  if (propsOptions && parentRawSetupState) {
    for (const propKey in propsOptions) {
      const parentVal = parentRawSetupState[propKey]
      if (!parentVal || typeof parentVal !== 'object') continue
      // console.log('parentVal', parentVal)
      const propNode: GraphNode = {
        id: `${componentName}.${propKey}`,
        varName: propKey,
        type: 'prop',
        val: (instance.props as Record<string, unknown>)[propKey],
        file,
        deps: [],
        subs: [],
      }
      nodes.push(propNode)
      console.log('rawSetupState',rawSetupState)
      const parentNode = valNodeMap.get(parentVal)
      if (parentNode) {
        propNode.deps.push(parentNode.id)
        if (!parentNode.subs.includes(propNode.id)) {
          console.log('propNode', propNode);
          console.log('parentNode', parentNode);
          parentNode.subs.push(propNode.id)
        }
      }
    }
  }

  if (rawSetupState) {
    trackSetupState(rawSetupState, componentName, file, nodes);
  }

  const watchEffects = instance.scope?.effects.filter(
    (e) => e !== instance.effect, // 過濾掉 component effect，因為它不是 watch 的 effect
  );

  if (watchEffects && watchEffects.length > 0) {
    watchEffects.forEach((effect: WatchEffects, index: number) => {
      const watchShortName = `w_${index}`;
      const watchNode: GraphNode = {
        id: `${componentName}.${watchShortName}`,
        type: "watch",
        val: null,
        file,
        deps: [],
        subs: [],
      };
      nodes.push(watchNode);

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
          valNodeMap.get(rawSetupState[depName] as object);
        if (depNode && !depNode.subs.includes(watchShortName)) {
          depNode.subs.push(watchShortName);
        }

        notifyUpdate();
      };

      effect.run();
    });
  }

  updateGraph(componentName, nodes);

  // 繼續往下找子組件
  walkVNode(instance.subTree, componentName);
  // console.log('nodes', nodes)
}

export function walkVNode(
  vnode: VNode,
  prevComponentName?: string | undefined,
): void {
  if (!vnode) return;
  if (vnode.component) {
    traverse(vnode.component as ExtendedComponentInstance, prevComponentName); // 遞迴
  }
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => {
      if (child && typeof child === "object")
        walkVNode(child as VNode, prevComponentName);
    });
  }
}
