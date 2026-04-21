import type { DebuggerEvent, VNode } from "vue";
import type {
  ExtendedComponentInstance,
  WatchEffects,
} from "../types/vue-internals";
import {
  collectSetupState,
  collectPiniaState,
  bindSetupTrack,
  resolveDepNode,
  resolveDepName,
  isStoreToRefsRef,
} from "./tracker";
import { GraphNode, updateGraph, getGraph, notifyUpdate } from "../graph";

// WeakMap：避免把 __node reference 直接掛在 Vue 物件上造成循環引用
const valNodeMap = new WeakMap<object, GraphNode>();
// WeakMap：props raw object → Map<propKey, GraphNode>
const propKeyNodeMap = new WeakMap<object, Map<string, GraphNode>>();
// WeakMap：inject raw → injectNode，專供 Phase 1 prop 來源解析使用
// 父層寫入後，子層 prop 連結時反查
const propSourceInjectMap = new WeakMap<object, GraphNode>();

const hmrOverrideMap = new Map<string, ExtendedComponentInstance>();

// 記錄每個 componentName 出現的次數，用於同名 component 多實例時產生唯一 graph key
const componentKeyCountMap = new Map<string, number>();

// parent sentinel dry-run 建立的 childType → { maps, nextIndex } 對應
// maps 按 vnode 出現順序存 propMap，nextIndex 追蹤下一個子 instance 該取第幾個
const instanceChildPropKeyMap = new WeakMap<
  object,
  Map<object, { maps: Map<string, string>[]; nextIndex: number }>
>();

export function resetComponentKeyCounts(): void {
  componentKeyCountMap.clear();
}

export function setHmrOverride(
  id: string,
  instance: ExtendedComponentInstance,
): void {
  hmrOverrideMap.set(id, instance);
}

export function deleteHmrOverride(id: string): void {
  hmrOverrideMap.delete(id);
}

function resolveInstance(
  old: ExtendedComponentInstance,
): ExtendedComponentInstance {
  const hmrId = (old?.type as any)?.__hmrId;
  return hmrId && hmrOverrideMap.has(hmrId) ? hmrOverrideMap.get(hmrId)! : old;
}

// 對齊 Vue 的 resolveAsset 邏輯：exact → camelCase → PascalCase
function resolveGlobalComponent(
  appContext: any,
  name: string,
): object | undefined {
  const components = appContext?.components;
  if (!components) return undefined;
  const camel = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  return components[name] ?? components[camel] ?? components[pascal];
}

// 遍歷 dry-run VNode tree，找出子元件 props 中的 sentinel symbol
function traverseVNodeForSentinels(
  vnode: any,
  sentinelToKey: Map<symbol, string>,
  rawSetupState: object,
  result: Map<object, { maps: Map<string, string>[]; nextIndex: number }>,
  appContext: any,
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
    // 全域元件（如 el-table）的 type 是字串，需從 appContext 解析成 component object
    // 才能與子元件的 instance.type 對應
    if (typeof resolvedType === "string") {
      resolvedType =
        resolveGlobalComponent(appContext, resolvedType) ?? resolvedType;
    }
    if (resolvedType && typeof resolvedType === "object") {
      const propMap = new Map<string, string>();

      if (typeof vnode.props === "symbol" && sentinelToKey.has(vnode.props)) {
        // Branch A：v-bind="someObj" 整包展開，vnode.props 本身是 sentinel Symbol
        const sourceKey = sentinelToKey.get(vnode.props)!;

        const reverseMap = new Map<unknown, string>();
        for (const [k, v] of Object.entries(rawSetupState as Record<string, unknown>)) {
          if (k !== sourceKey) reverseMap.set(v, k);
        }

        const sourceVal = (rawSetupState as any)[sourceKey];
        const rawSourceObj = (sourceVal?.__v_raw ?? sourceVal) as Record<string, unknown> | null;
        if (rawSourceObj && typeof rawSourceObj === "object") {
          for (const innerKey of Object.keys(rawSourceObj)) {
            const innerVal = rawSourceObj[innerKey];
            const sourceVarName = reverseMap.get(innerVal);
            if (sourceVarName !== undefined) {
              propMap.set(innerKey, sourceVarName);
            } else {
              console.warn(
                `v-bind展開追蹤：無法在 rawSetupState 中找到 "${sourceKey}.${innerKey}" 的來源變數，該 prop 將不會被追蹤。`,
              );
            }
          }
        }
      } else {
        // Branch B：逐一比對每個 prop 值是否為 sentinel Symbol
        for (const [propName, val] of Object.entries(
          vnode.props as Record<string, unknown>,
        )) {
          if (typeof val === "symbol" && sentinelToKey.has(val)) {
            propMap.set(propName, sentinelToKey.get(val)!);
          }
        }
      }

      if (propMap.size > 0) {
        const existing = result.get(resolvedType as object);
        if (existing) {
          existing.maps.push(propMap);
        } else {
          result.set(resolvedType as object, { maps: [propMap], nextIndex: 0 });
        }
      }
    }
  }

  // 遞迴 children
  const children = vnode.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      traverseVNodeForSentinels(
        child,
        sentinelToKey,
        rawSetupState,
        result,
        appContext,
      );
    }
  } else if (children && typeof children === "object") {
    // Slots
    for (const slotFn of Object.values(children)) {
      if (typeof slotFn === "function") {
        try {
          const slotVNodes = (slotFn as () => unknown)();
          if (Array.isArray(slotVNodes)) {
            for (const sv of slotVNodes) {
              traverseVNodeForSentinels(
                sv,
                sentinelToKey,
                rawSetupState,
                result,
                appContext,
              );
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
  oldInstance: ExtendedComponentInstance,
  prevComponentName?: string,
): void {
  const instance = resolveInstance(oldInstance);

  const file =
    ((instance.type as Record<string, unknown>).__name as string) ||
    ((instance.type as Record<string, unknown>).name as string) ||
    "Anonymous";

  const baseComponentName = prevComponentName
    ? `${prevComponentName}.${file}`
    : file;

  // 子組件重用
  const count = componentKeyCountMap.get(baseComponentName) ?? 0;
  componentKeyCountMap.set(baseComponentName, count + 1);
  const componentName =
    count === 0 ? baseComponentName : `${baseComponentName}_${count}`;

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

    const parentChildPropMap = instance.parent
      ? instanceChildPropKeyMap.get(instance.parent)
      : undefined;

    const typeData = parentChildPropMap?.get(
      instance.type as unknown as object,
    );

    const siblingIndex = typeData?.nextIndex ?? 0;
    if (typeData) typeData.nextIndex++;

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

      // sentinel dry-run prop map
      const sourceKey = typeData?.maps[siblingIndex]?.get(propKey);

      if (sourceKey) {
        if (sourceKey.startsWith("props.") && instance.parent?.props) {
          // props.test => test
          const parentPropKey = sourceKey.slice(6);
          const parentRawPropsObj = ((instance.parent.props as any).__v_raw ??
            instance.parent.props) as object;
          parentNode = propKeyNodeMap
            .get(parentRawPropsObj)
            ?.get(parentPropKey);
        } else if (parentRawSetupState) {
          const sourceRaw = (parentRawSetupState as any)[sourceKey];
          if (sourceRaw)
            parentNode =
              propSourceInjectMap.get(sourceRaw) ?? valNodeMap.get(sourceRaw);
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

  // Inject 偵測：比對 rawSetupState 值與 parent.provides，找出 inject alias
  // 必須在 collectSetupState 之前，避免 inject 來的 ref/reactive 被誤建成一般 node
  const injectKeySet = new Set<string>();
  const parentProvides = instance.parent?.provides;
  if (parentProvides) {
    // 先建 raw → parentNode 的 lookup，避免雙層 for...in
    const provideRawToNode = new Map<object, GraphNode>();
    for (const key in parentProvides) {
      const val = (parentProvides as Record<string, unknown>)[key];
      if (typeof val !== "object" || val === null) continue;
      const parentNode = valNodeMap.get(val as object);
      if (parentNode) provideRawToNode.set(val as object, parentNode);
    }

    if (provideRawToNode.size > 0) {
      for (const childKey in rawSetupState) {
        const val = rawSetupState[childKey];
        if (typeof val !== "object" || val === null) continue;
        const parentNode = provideRawToNode.get(val as object);

        if (!parentNode) continue;
        injectKeySet.add(childKey);
        const injectNode: GraphNode = {
          id: `${componentName}.${childKey}`,
          varName: childKey,
          type: "inject",
          val: (val as any).__v_raw ?? val,
          file,
          deps: [parentNode.id],
          subs: [],
        };
        if (!parentNode.subs.includes(injectNode.id)) {
          parentNode.subs.push(injectNode.id);
        }
        nodes.push(injectNode);
        // 不覆寫 valNodeMap，避免兄弟元件處理時互蓋
        // 寫入 propSourceInjectMap，讓子層 prop 連結能查到此 inject node（深度優先保證父層先寫）
        const injectRaw = (val as any).__v_raw ?? val;
        propSourceInjectMap.set(injectRaw as object, injectNode);
      }
    }
  }

  const pinia = instance.appContext.app.config.globalProperties.$pinia;
  collectPiniaState(pinia, nodes, valNodeMap);

  // per-component：store 底層值 → component node（storeToRefs ref/reactive）
  // 與 injectRawToLocalNode 同理，每個 component 獨立建立，避免兄弟 component 互蓋
  const storeValToComponentNode = new Map<object, GraphNode>();

  const storeComputedKeySet = new Set<string>();
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    if (!(typeof val === "object" && val !== null)) continue;
    if (!(val as any)?.$id) continue;
    const raw = (val as any).__v_raw ?? val;
    for (const k in raw) {
      if ((raw[k] as any)?.effect) storeComputedKeySet.add(k);
    }
  }

  if (rawSetupState) {
    collectSetupState({
      rawSetupState,
      namespace: componentName,
      file,
      nodes,
      valNodeMap,
      skipKeys: injectKeySet,
      storeComputedKeySet,
      storeValToComponentNode,
    });
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
  if ((instance as any).render && (Object.keys(rawSetupState).length > 0 || !!propsOptions)) {
    //withProxy 是給 runtime-compiled 模板（with block）使用的 proxy，有不同的 has trap
    // 讓 with(ctx){...} 的屬性查找能正確運作，沒有時 fallback 到一般 proxy
    const proxyToUse = (instance as any).withProxy ?? (instance as any).proxy;
    const sentinelToKey = new Map<symbol, string>();

    const propsSentinelProxy = propsOptions
      ? new Proxy(instance.props as object, {
          get(target, key, receiver) {
            //  <AboutView :aboutData="text" />
            if (
              typeof key === "string" &&
              !key.startsWith("__v_") &&
              key in propsOptions
            ) {
              const s = Symbol(`props.${key}`);
              sentinelToKey.set(s, `props.${key}`);
              return s;
            }
            return Reflect.get(target, key, receiver);
          },
        })
      : instance.props;

    //sentinel proxy 讓每個 setupState key 回傳唯一 Symbol 代替真實值
    // render 執行後，VNode props 中出現的 Symbol 就能直接對應回父層的 key 名
    // 不需要比對 value（primitive 值會碰撞），每個 Symbol 天生唯一
    const sentinelProxy = new Proxy((instance.setupState ?? {}) as object, {
      get(target, key, receiver) {
        if (typeof key === "string" && !key.startsWith("__v_")) {
          //  <AboutView :aboutData="props.text" />
          if (key === "props" && instance.props) return propsSentinelProxy;
          const s = Symbol(key);
          sentinelToKey.set(s, key);
          return s;
        }
        return Reflect.get(target, key, receiver);
      },
    });

    const savedProps = instance.props;
    instance.props = propsSentinelProxy as any;

    //暫時替換 instance.setupState 讓 render 存取 sentinel proxy
    // 結束後必須還原，否則會破壞 Vue 的響應式系統
    const savedSetupState = instance.setupState;
    instance.setupState = sentinelProxy as any;
    let dryRunVNode: any = null;

    // dry-run 時 currentRenderingInstance 為 null，resolveComponent 會發出警告但仍 fallback 回字串
    // 我們已透過 resolveGlobalComponent 處理此 fallback，暫時靜音避免 console 噪音
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      //編譯後的 render 函數簽名為 (ctx, cache, $props, $setup, $data, $options)
      // $setup 必須傳入 sentinelProxy，模板的 _ctx.xxx 才會存取到 sentinel 值
      dryRunVNode = (instance as any).render.call(
        proxyToUse,
        proxyToUse, // _ctx
        (instance as any).renderCache ?? [], // _cache
        instance.props, // $props ← props sentinel
        sentinelProxy, // $setup ← sentinel proxy
        (instance as any).data ?? {}, // $data
        (instance as any).ctx ?? {}, // $options
      );
    } catch {
      // ignore render errors during dry-run
    } finally {
      console.warn = origWarn;
    }

    // 復原Vue狀態避免不可預期的行為
    instance.setupState = savedSetupState;
    instance.props = savedProps;

    if (dryRunVNode) {
      const childPropMap = new Map<
        object,
        { maps: Map<string, string>[]; nextIndex: number }
      >();
      traverseVNodeForSentinels(
        dryRunVNode,
        sentinelToKey,
        rawSetupState,
        childPropMap,
        instance.appContext,
      );

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
  oldInstance: ExtendedComponentInstance,
  prevComponentName?: string,
): void {
  const instance = resolveInstance(oldInstance);
  const file =
    ((instance.type as Record<string, unknown>).__name as string) ||
    ((instance.type as Record<string, unknown>).name as string) ||
    "Anonymous";

  const baseComponentName = prevComponentName
    ? `${prevComponentName}.${file}`
    : file;
  const count = componentKeyCountMap.get(baseComponentName) ?? 0;
  componentKeyCountMap.set(baseComponentName, count + 1);
  const componentName =
    count === 0 ? baseComponentName : `${baseComponentName}_${count}`;

  const rawSetupState = instance.setupState?.["__v_raw"] || {};
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
    const componentNode = valNodeMap.get(val as object);
    if (storeVal && typeof storeVal === "object" && componentNode) {
      storeValToComponentNode.set(storeVal as object, componentNode);
    }
  }
  if (rawSetupState) {
    bindSetupTrack({
      rawSetupState,
      componentName,
      valNodeMap,
      propKeyNodeMap,
      injectRawToLocalNode,
      storeValToComponentNode,
    });
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

      const watchFullId = `${componentName}.${watchShortName}`;

      effect.onTrack = (event: DebuggerEvent) => {
        const depName = resolveDepName(
          event.target as object,
          event.key,
          propKeyNodeMap,
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
