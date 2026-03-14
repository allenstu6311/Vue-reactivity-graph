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

// parent render 時存取了哪些 setupState key → rawVal（供子層 prop 連結使用）
const instancePropAccessLog = new WeakMap<object, Map<string, object>>();

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

  // 在開頭裝 recording proxy（不恢復，讓後續 Vue 自然 re-render 也能捕捉）
  const accessLog = new Map<string, object>();
  instancePropAccessLog.set(instance, accessLog);
  if ((instance as any).render && Object.keys(rawSetupState).length > 0) {
    const recordProxy = new Proxy(instance.setupState as object, {
      get(target, key, receiver) {
        if (typeof key === "string" && !key.startsWith("__v_")) {
          const raw = (rawSetupState as any)[key];
          if (raw && typeof raw === "object") {
            accessLog.set(key, raw);
          }
        }
        return Reflect.get(target, key, receiver);
      },
    });
    instance.setupState = recordProxy as any;
  }

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
      const vnodePropVal = (instance.vnode?.props as any)?.[propKey];
      const parentAccessLog = instance.parent
        ? instancePropAccessLog.get(instance.parent)
        : undefined;
      let parentNode: GraphNode | undefined;

      // Strategy 1: 同名查找（適用所有同名 prop，包含 ref / reactive）
      if (parentRawSetupState) {
        const sameNameVal = (parentRawSetupState as any)[propKey];
        if (sameNameVal && typeof sameNameVal === "object") {
          parentNode = valNodeMap.get(sameNameVal);
        }
      }

      // Strategy 2: accessLog 查找（適用不同名 prop）
      // - reactive 直接 identity match
      // - ref({...}) 透過 _value identity match（唯一）
      // - ref(primitive) 透過 _value value match（可能有 collision）
      if (!parentNode && vnodePropVal !== undefined && parentAccessLog) {
        for (const [, rawVal] of parentAccessLog) {
          if (
            rawVal === vnodePropVal ||
            (rawVal as any)?._value === vnodePropVal
          ) {
            parentNode = valNodeMap.get(rawVal);
            if (parentNode) break;
          }
        }
      }

      if (parentNode) {
        propNode.deps.push(parentNode.id);
        if (!parentNode.subs.includes(propNode.id)) {
          parentNode.subs.push(propNode.id);
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

  // Dry-run render：傳入正確的 $setup 參數觸發 recording proxy
  // Vue template 存取 $setup.xxx（不是 _ctx.xxx），需要明確傳入
  if ((instance as any).render && Object.keys(rawSetupState).length > 0) {
    const proxyToUse = (instance as any).withProxy ?? (instance as any).proxy;

    try {
      (instance as any).render.call(
        proxyToUse,
        proxyToUse,                                  // _ctx
        (instance as any).renderCache ?? [],         // _cache
        instance.props,                              // $props
        instance.setupState,                         // $setup ← recording proxy
        (instance as any).data ?? {},                // $data
        (instance as any).ctx ?? {},                 // $options
      );
    } catch {
      // ignore render errors during dry-run
    }
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
