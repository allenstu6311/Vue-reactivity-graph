import type { RawAppContext, SentinelVNode } from "../../types/vue-internals";
import type { SentinelDryRunParams } from "./types";

function resolveGlobalComponent(
  appContext: RawAppContext | null | undefined,
  name: string,
): object | undefined {
  const components = appContext?.components;
  if (!components) return undefined;
  const camel = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  return (components[name] ?? components[camel] ?? components[pascal]) as object | undefined;
}

function traverseVNodeForSentinels(
  vnode: SentinelVNode | null | undefined,
  sentinelToKey: Map<symbol, string>,
  rawSetupState: object,
  result: Map<object, { maps: Map<string, string>[]; nextIndex: number }>,
  appContext: RawAppContext | null | undefined,
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
        child as SentinelVNode | null | undefined,
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
                sv as SentinelVNode | null | undefined,
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

// 副作用警示：此函數會暫時 mutation instance.props 與 instance.setupState。
// 必須完整保留 save → replace → finally-restore 模式：
//   const savedSetupState = instance.setupState
//   const savedProps = instance.props
//   instance.setupState = sentinelProxy as any
//   instance.props = sentinelPropsProxy as any
//   try { dryRunVNode = instance.render!.call(...) }
//   catch { /* ignore */ } finally {
//     instance.setupState = savedSetupState
//     instance.props = savedProps
//   }
// 若 finally 結構被破壞，render 拋錯時 Vue 響應式系統將永久錯亂。
export function runSentinelDryRun(params: SentinelDryRunParams): void {
  const { instance, rawSetupState, propsOptions, ctx } = params;

  if (!instance.render || (Object.keys(rawSetupState).length === 0 && !propsOptions)) {
    return;
  }

  const proxyToUse = instance.withProxy ?? instance.proxy;
  const sentinelToKey = new Map<symbol, string>();

  const sentinelPropsProxy = propsOptions
    ? new Proxy(instance.props as object, {
        get(target, key, receiver) {
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

  const sentinelProxy = new Proxy((instance.setupState ?? {}) as Record<string, any>, {
    get(target, key, receiver) {
      if (typeof key === "string" && !key.startsWith("__v_")) {
        if (key === "props" && instance.props) return sentinelPropsProxy;
        const s = Symbol(key);
        sentinelToKey.set(s, key);
        return s;
      }
      return Reflect.get(target, key, receiver);
    },
  });

  const savedProps = instance.props;
  instance.props = sentinelPropsProxy as any;

  const savedSetupState = instance.setupState;
  instance.setupState = sentinelProxy as any;
  let dryRunVNode: any = null;

  const origWarn = console.warn;
  console.warn = () => {};
  try {
    dryRunVNode = instance.render!.call(
      proxyToUse,
      proxyToUse!,
      instance.renderCache ?? [],
      instance.props,
      sentinelProxy,
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
    const dryRunChildPropMap = new Map<
      object,
      { maps: Map<string, string>[]; nextIndex: number }
    >();
    traverseVNodeForSentinels(
      dryRunVNode as SentinelVNode | null | undefined,
      sentinelToKey,
      rawSetupState,
      dryRunChildPropMap,
      instance.appContext,
    );

    if (dryRunChildPropMap.size > 0) {
      ctx.instanceChildPropKeyMap.set(instance, dryRunChildPropMap);
    }
  }
}
