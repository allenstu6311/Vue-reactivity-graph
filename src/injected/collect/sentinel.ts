import type { RawAppContext, SentinelVNode } from "../../types/vue-internals";
import type { SentinelDryRunParams } from "./types";
import type { GraphNode } from "../../graph";
import type { WalkContext } from "../context/WalkContext";
import {
  isObject,
  isString,
  isSymbol,
  isFunction,
} from "@/shared/helper/guards";
import { getRaw, unref } from "../helper/nodes";

interface SentinelMeta {
  chain: unknown[];
  rootKey: string;
}

/**
 * 【基礎設施】sentinel（callable Proxy）→ 它的 `{ chain, rootKey }`。
 * 讓 isSentinel 認出「這是我發的 sentinel」，並取回它走過的來源鏈供反查。
 */
const sentinelRegistry = new WeakMap<object, SentinelMeta>();

function isSentinel(val: unknown): val is object {
  // sentinel 是 callable Proxy（typeof === "function"），故須 isObject || isFunction
  return (
    (isObject(val) || isFunction(val)) && sentinelRegistry.has(val as object)
  );
}

function createSentinel(chain: unknown[], rootKey: string): object {
  const base = function () {};
  const s: any = new Proxy(base, {
    apply: () => createSentinel([], rootKey),
    get: (_t, prop) => {
      // 不讓 sentinel 偽裝成 Vue 內部物件：
      // - 所有 __v_* 鍵（__v_isRef/__v_isReactive/__v_isReadonly/__v_raw/__v_isVNode...）回 undefined，
      //   否則 createVNode/guardReactiveProps 會把 v-bind 的 sentinel 當 reactive props extend 成空物件，破壞 Branch A
      // - Suspense/Teleport 標記同理（避免 createVNode 算錯 shapeFlag）
      if (typeof prop === "string") {
        if (prop.startsWith("__v_")) return undefined;
        if (prop === "__isSuspense" || prop === "__isTeleport")
          return undefined;
      }
      // 被字串化時（模板插值 `${sentinel}`、字串拼接）回空字串，避免拋錯或產生垃圾文字
      if (prop === Symbol.toPrimitive) {
        return () => "";
      }
      const tip = chain[chain.length - 1];
      // 防止讀 ref/computed 的 .value 觸發 getter（__v_isRef 對兩者均為 true）
      if (prop === "value" && (tip as any)?.__v_isRef === true) {
        return s;
      }

      // 往下導航：取「目前這層真實值」的 prop，串進 chain 供日後反查來源。
      // 用 try/catch 是因為 tip 可能是會在 getter 裡拋錯的物件（如存取未就緒的 proxy），
      // dry-run 不該因此中斷——取不到就當 undefined，sentinel 照樣往下走。
      let realChild: unknown;
      try {
        realChild = (getRaw(tip) as any)?.[prop];
      } catch {
        realChild = undefined;
      }

      return createSentinel([...chain, realChild], rootKey);
    },
  });
  sentinelRegistry.set(s, { chain, rootKey });
  return s;
}

function resolveGlobalComponent(
  appContext: RawAppContext | null | undefined,
  name: string,
): object | undefined {
  const components = appContext?.components;
  if (!components) return undefined;
  const camel = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  return (components[name] ?? components[camel] ?? components[pascal]) as
    | object
    | undefined;
}

function resolveChain(
  chain: unknown[],
  ctx: WalkContext,
): GraphNode | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const normed = getRaw(chain[i]);
    if (!isObject(normed)) continue;
    const node =
      ctx.propSourceInjectMap.get(normed) ?? ctx.valNodeMap.get(normed);
    if (node) return node;
  }
  return undefined;
}

// dry-run 後掃 VNode 樹，撈出「每個子組件的每個 prop ← 父層哪個來源」，寫進 dryRunChildPropMap。
// dryRunChildPropMap：子組件身分(vnode.type 物件) → { maps[]：同型多實例各一張 propName→來源; nextIndex：讀取游標 }
function traverseVNodeForSentinels(
  vnode: SentinelVNode | null | undefined,
  ctx: WalkContext,
  dryRunChildPropMap: Map<
    object,
    { maps: Map<string, string>[]; nextIndex: number }
  >,
  appContext: RawAppContext | null | undefined,
): void {
  if (!isObject(vnode)) return;

  if (vnode.type && vnode.props) {
    // ── 還原子組件身分（resolvedComponent）：把 vnode.type 收斂成「真正的 component 物件」───────
    // vnode.type 不是分類標籤，而是「這個 vnode 畫的是哪個子組件」的身分；可能以三種形式出現，
    // 全部統一還原成 component 物件，才能與子層 instance.type 對得起來。
    let resolvedComponent: unknown = vnode.type;
    // 形式1：component 定義在 setupState 裡（如 <component :is="MyComp" />）→ type 本身是 sentinel
    if (isSentinel(vnode.type)) {
      const meta = sentinelRegistry.get(vnode.type as object)!;
      resolvedComponent = getRaw(meta.chain[meta.chain.length - 1]);
    }
    // 形式2：全域元件（如 el-table）→ type 是字串，從 appContext 查回 component 物件
    if (isString(resolvedComponent)) {
      resolvedComponent =
        resolveGlobalComponent(appContext, resolvedComponent) ??
        resolvedComponent;
    }
    // 形式3：已是 component 物件 → 直接進來撈 prop 來源
    if (isObject(resolvedComponent)) {
      /** 【組2 偵察情報】單一子組件實例的 propName → **來源 id 字串**（如 `'5.obj'`），稍後疊進 `dryRunChildPropMap.maps[]`。 */
      const propSourceMap = new Map<string, string>();

      if (isSentinel(vnode.props)) {
        // ── Branch A：v-bind="someObj" 整包展開 ────────────────────────────────
        // 整個 props 是單一表達式 → vnode.props 本身是 sentinel，不能 Object.entries，
        // 必須把背後物件讀出來逐 key 反查。
        const meta = sentinelRegistry.get(vnode.props)!;
        const tip = meta.chain[meta.chain.length - 1];
        // 刻意例外：v-bind 展開需把物件值讀出來才有 key 可列舉，故此處 unref（含 computed 讀 .value）一次。
        const rawSourceObj = isObject(tip) ? getRaw(unref(tip)) : null;
        if (isObject(rawSourceObj)) {
          for (const innerKey of Object.keys(rawSourceObj)) {
            const innerVal = (rawSourceObj as any)[innerKey];
            const node = resolveChain([innerVal], ctx);
            if (node) propSourceMap.set(innerKey, node.id);
          }
        }
      } else if (vnode.props && isObject(vnode.props)) {
        // ── Branch B：一般情形 <Child :count="count" /> ──────────────────────────
        // 每個 prop 值各自是 sentinel，逐一反查。
        for (const [propName, val] of Object.entries(
          vnode.props as Record<string, unknown>,
        )) {
          if (isSentinel(val)) {
            const meta = sentinelRegistry.get(val as object)!;
            const node = resolveChain(meta.chain, ctx);
            if (node) {
              propSourceMap.set(propName, node.id);
            } else {
              // resolveChain 無法找到節點時，存 rootKey 供 props.ts 後續處理（如 props.x 轉傳）
              propSourceMap.set(propName, meta.rootKey);
            }
          }
        }
      }

      // ── 聚合：同型子組件多次出現（<Child/><Child/>）→ 各疊一張 propSourceMap，靠 nextIndex 對位 ──
      if (propSourceMap.size > 0) {
        const siblingMaps  = dryRunChildPropMap.get(resolvedComponent);
        if (siblingMaps) {
          siblingMaps.maps.push(propSourceMap);
        } else {
          dryRunChildPropMap.set(resolvedComponent, {
            maps: [propSourceMap],
            nextIndex: 0,
          });
        }
      }
    }
  }

  // ── 遞迴 children：組件可能包在 <div>、fragment、v-for 清單裡，往下鑽才找得到 ──────────────
  const children = vnode.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      traverseVNodeForSentinels(
        child as SentinelVNode | null | undefined,
        ctx,
        dryRunChildPropMap,
        appContext,
      );
    }
  } else if (isObject(children)) {
    // ── 遞迴 slots：slot 內容是函式，呼叫才拿得到 vnode；裡面也可能有組件吃父層 prop ────────────
    for (const slotFn of Object.values(children)) {
      if (isFunction(slotFn)) {
        try {
          const slotVNodes = (slotFn as () => unknown)();
          if (Array.isArray(slotVNodes)) {
            for (const sv of slotVNodes) {
              traverseVNodeForSentinels(
                sv as SentinelVNode | null | undefined,
                ctx,
                dryRunChildPropMap,
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

// 副作用警示：此函數會暫時 mutation instance.props 與 instance.setupState。
// 必須完整保留 save → replace → finally-restore 模式：
//   const savedSetupState = instance.setupState
//   const savedProps = instance.props
//   instance.setupState = sentinelSetupProxy as any
//   instance.props = sentinelPropsProxy as any
//   try { dryRunVNode = instance.render!.call(...) }
//   catch { /* ignore */ } finally {
//     instance.setupState = savedSetupState
//     instance.props = savedProps
//   }
// 若 finally 結構被破壞，render 拋錯時 Vue 響應式系統將永久錯亂。
export function runSentinelDryRun(params: SentinelDryRunParams): void {
  const { instance, rawSetupState, propsOptions, ctx } = params;

  if (
    !instance.render ||
    (Object.keys(rawSetupState).length === 0 && !propsOptions)
  ) {
    return;
  }

  const proxyToUse = instance.withProxy ?? instance.proxy;

  const sentinelPropsProxy = propsOptions
    ? new Proxy(instance.props as object, {
        get(target, key, receiver) {
          if (isString(key) && !key.startsWith("__v_") && key in propsOptions) {
            // 讀原始 props（target，建 proxy 時捕獲），不可讀 instance.props——
            // 它此刻已被換成本 proxy，會無限遞迴
            return createSentinel([(target as any)[key]], `props.${key}`);
          }
          return Reflect.get(target, key, receiver);
        },
      })
    : instance.props;

  const sentinelSetupProxy = new Proxy(
    (instance.setupState ?? {}) as Record<string, any>,
    {
      get(target, key, receiver) {
        if (isString(key) && !key.startsWith("__v_")) {
          if (key === "props" && instance.props) return sentinelPropsProxy;
          return createSentinel([(rawSetupState as any)[key]], key);
        }
        return Reflect.get(target, key, receiver);
      },
    },
  );

  const savedProps = instance.props;
  instance.props = sentinelPropsProxy as any;

  const savedSetupState = instance.setupState;
  instance.setupState = sentinelSetupProxy as any;
  let dryRunVNode: any = null;

  const origWarn = console.warn;
  console.warn = () => {};
  try {
    dryRunVNode = instance.render!.call(
      proxyToUse,
      proxyToUse!,
      instance.renderCache ?? [],
      instance.props,
      sentinelSetupProxy,
      instance.data ?? {},
      instance.ctx ?? {},
    );
  } catch {
    /* ignore render errors during dry-run */
  } finally {
    console.warn = origWarn;
    instance.setupState = savedSetupState;
    instance.props = savedProps;
  }

  if (dryRunVNode) {
    /**
     * 【組2 偵察情報】本父層 dry-run 結果：子組件物件 → `{ maps[]：同型多實例各一張 (propName→來源id); nextIndex }`。
     * 掃完整棵 VNode 樹後，存進 `ctx.instanceChildPropKeyMap`（以此 instance 為 key）供子層 collectProps 讀取。
     */
    const dryRunChildPropMap = new Map<
      object,
      { maps: Map<string, string>[]; nextIndex: number }
    >();
    traverseVNodeForSentinels(
      dryRunVNode as SentinelVNode | null | undefined,
      ctx,
      dryRunChildPropMap,
      instance.appContext,
    );

    if (dryRunChildPropMap.size > 0) {
      ctx.instanceChildPropKeyMap.set(instance, dryRunChildPropMap);
    }
  }
}
