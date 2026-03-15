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
import { GraphNode, updateGraph, getGraph, notifyUpdate } from "../graph";

// parent sentinel dry-run 建立的 childType → propName → parentSetupKey 對應
const instanceChildPropKeyMap = new WeakMap<
  object,
  Map<object, Map<string, string>>
>();

// 遍歷 dry-run VNode tree，找出子元件 props 中的 sentinel symbol
function traverseVNodeForSentinels(
  vnode: any,
  sentinelToKey: Map<symbol, string>,
  rawSetupState: object,
  result: Map<object, Map<string, string>>,
): void {
  if (!vnode || typeof vnode !== "object") return;

  if (vnode.type && vnode.props) {
    // vnode.type 本身可能也是 sentinel（component 定義在 setupState 裡）
    // 需要還原回真實的 component object
    let resolvedType: unknown = vnode.type;
    if (typeof vnode.type === "symbol" && sentinelToKey.has(vnode.type)) {
      const keyName = sentinelToKey.get(vnode.type)!;
      resolvedType = (rawSetupState as any)[keyName];
    }

    if (resolvedType && typeof resolvedType === "object") {
      const propMap = new Map<string, string>();
      for (const [propName, val] of Object.entries(
        vnode.props as Record<string, unknown>,
      )) {
        if (typeof val === "symbol" && sentinelToKey.has(val)) {
          propMap.set(propName, sentinelToKey.get(val)!);
        }
      }
      if (propMap.size > 0) {
        result.set(resolvedType as object, propMap);
      }
    }
  }

  // 遞迴 children
  const children = vnode.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      traverseVNodeForSentinels(child, sentinelToKey, rawSetupState, result);
    }
  } else if (children && typeof children === "object") {
    // Slots
    for (const slotFn of Object.values(children)) {
      if (typeof slotFn === "function") {
        try {
          const slotVNodes = (slotFn as () => unknown)();
          if (Array.isArray(slotVNodes)) {
            for (const sv of slotVNodes) {
              traverseVNodeForSentinels(sv, sentinelToKey, rawSetupState, result);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
}

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
  // instance.propsOptions = [props定義物件, Vue內部轉型列表]，取 [0] 遍歷所有 prop 名稱
  const propsOptions = instance.propsOptions?.[0];

  // Props 追蹤：建 prop nodes + 存進 propKeyNodeMap
  if (propsOptions) {
    // instance.props 是響應式 proxy，需取 __v_raw 原始物件作為 WeakMap key
    // 否則 proxy 與 raw 是不同物件，外層傳入同一個 props 時無法命中
    const rawPropsObj = ((instance.props as any).__v_raw ??
      instance.props) as object;
    const propMap = new Map<string, GraphNode>();
    // computed/watch 的 onTrack event.target 是 raw props object，不在 valNodeMap 裡
    // 因此另開 propKeyNodeMap，讓 onTrack 能從 props raw object 查到對應的 prop node
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
      let parentNode: GraphNode | undefined;

      // Strategy 1: 同名查找（適用所有同名 prop，包含 ref / reactive）
      if (parentRawSetupState) {
        const sameNameVal = (parentRawSetupState as any)[propKey];
        if (sameNameVal && typeof sameNameVal === "object") {
          parentNode = valNodeMap.get(sameNameVal);
        }
      }

      // Strategy 2: sentinel dry-run prop map（適用不同名 prop）
      if (!parentNode) {
        const parentChildPropMap = instance.parent
          ? instanceChildPropKeyMap.get(instance.parent)
          : undefined;

        const sourceKey = parentChildPropMap
          ?.get(instance.type as unknown as object)
          ?.get(propKey);

        if (sourceKey && parentRawSetupState) {
          const sourceRaw = (parentRawSetupState as any)[sourceKey];
          if (sourceRaw) parentNode = valNodeMap.get(sourceRaw);
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
  //instance.scope.effects 包含 render effect 與所有 watch effect
  // instance.effect 是 component 的 render effect，需要排除，只保留 watch
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

  // Sentinel dry-run：對每個 setupState key 回傳唯一 symbol
  // 捕捉 dry-run VNode，從子元件 props 中的 sentinel 直接建立 propName → parentKey 對應
  if ((instance as any).render && Object.keys(rawSetupState).length > 0) {
    //withProxy 是給 runtime-compiled 模板（with block）使用的 proxy，有不同的 has trap
    // 讓 with(ctx){...} 的屬性查找能正確運作，沒有時 fallback 到一般 proxy
    const proxyToUse = (instance as any).withProxy ?? (instance as any).proxy;
    const sentinelToKey = new Map<symbol, string>();
    //sentinel proxy 讓每個 setupState key 回傳唯一 Symbol 代替真實值
    // render 執行後，VNode props 中出現的 Symbol 就能直接對應回父層的 key 名
    // 不需要比對 value（primitive 值會碰撞），每個 Symbol 天生唯一
    const sentinelProxy = new Proxy(instance.setupState as object, {
      get(target, key, receiver) {
        //跳過 __v_ 開頭的 Vue 內部屬性，攔截會破壞響應式系統
        if (typeof key === "string" && !key.startsWith("__v_")) {
          const s = Symbol(key);
          sentinelToKey.set(s, key);
          return s;
        }
        return Reflect.get(target, key, receiver);
      },
    });

    //暫時替換 instance.setupState 讓 render 存取 sentinel proxy
    // 結束後必須還原，否則會破壞 Vue 的響應式系統
    const savedSetupState = instance.setupState;
    instance.setupState = sentinelProxy as any;
    let dryRunVNode: any = null;
    try {
      //編譯後的 render 函數簽名為 (ctx, cache, $props, $setup, $data, $options)
      // $setup 必須傳入 sentinelProxy，模板的 _ctx.xxx 才會存取到 sentinel 值
      dryRunVNode = (instance as any).render.call(
        proxyToUse,
        proxyToUse,                                // _ctx
        (instance as any).renderCache ?? [],       // _cache
        instance.props,                            // $props
        sentinelProxy,                             // $setup ← sentinel proxy
        (instance as any).data ?? {},              // $data
        (instance as any).ctx ?? {},               // $options
      );
    } catch {
      // ignore render errors during dry-run
    }
    instance.setupState = savedSetupState;

    if (dryRunVNode) {
      const childPropMap = new Map<object, Map<string, string>>();
      traverseVNodeForSentinels(dryRunVNode, sentinelToKey, rawSetupState, childPropMap);
      if (childPropMap.size > 0) {
        instanceChildPropKeyMap.set(instance, childPropMap);
      }
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
          trackerEvent.__vrg_depKey ??
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
