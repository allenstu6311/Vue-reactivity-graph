import {
  collectInstance,
  triggerInstance,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import type { ExtendedComponentInstance, HookComponentEventArgs, VueAppInternals } from "../types/vue-internals";
import { getGraph, setOnUpdate } from "../graph";
import type { NodeType } from "../graph";

const appEl = document.querySelector("#app") as
  | (Element & VueAppInternals)
  | null;
const app = appEl?.__vue_app__?._instance;
const hmr = (window as any).__VUE_HMR_RUNTIME__;

const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
const originalEmit = hook.emit.bind(hook);
const pendingHmrIds = new Set<string>();

if (app) {
  const ctx = new WalkContext();

  function sanitizeVal(val: unknown, type: NodeType): unknown {
    switch (type) {
      case "ref":
      case "computed":
      case "store":
        return (val as any)?._value;
      case "reactive":
        return { ...(val as object) };
      case "watch":
        return "";
      case "inject":
        // inject 可能是 ref（有 _value）或 reactive（無 _value，展開物件）
        return (val as any)?._value !== undefined
          ? (val as any)._value
          : { ...(val as object) };
    }
  }

  function refreshGraph() {
    const plain = Object.fromEntries(
      Object.entries(getGraph()).map(([comp, nodes]) => [
        comp,
        nodes.map((n) => ({
          ...n,
          // val: sanitizeVal(n.val, n.type),
          val: "", // 暫時不顯示資料
        })),
      ]),
    );

    (window as unknown as Record<string, unknown>).__vueReactivityGraph = plain;
    window.postMessage({ type: "VUE_GRAPH_UPDATE" }, "*");
  }

  if (hmr) {
    const originalReload = hmr.reload;
    const originalRender = hmr.rerender;

    hmr.reload = function (id: string, _newComp: unknown) {
      pendingHmrIds.add(id);
      return originalReload.call(this, id, _newComp);
    };

    hmr.rerender = function (id: string, _newComp: unknown) {
      pendingHmrIds.add(id);
      return originalRender.call(this, id, _newComp);
    };
  }

  hook.emit = function (event: string, ...args: unknown[]) {
    if (
      (event === "component:added" || event === "component:updated") &&
      pendingHmrIds.size > 0
    ) {
      const [vueApp, , , instance] = args as HookComponentEventArgs;
      const hmrId: string | undefined = (instance?.type as any)?.__hmrId;
      if (hmrId && pendingHmrIds.has(hmrId)) {
        pendingHmrIds.delete(hmrId);
        ctx.hmrOverrideMap.set(hmrId, instance);
        ctx.resetCounts();
        collectInstance({ rawInstance: vueApp._instance, ctx });
        ctx.resetCounts();
        triggerInstance({ rawInstance: vueApp._instance, ctx });
        ctx.hmrOverrideMap.delete(hmrId);
        refreshGraph();
      }
    }
    return originalEmit(event, ...args);
  };

  setOnUpdate(refreshGraph);
  ctx.resetCounts();
  collectInstance({ rawInstance: app, ctx });
  ctx.resetCounts();
  triggerInstance({ rawInstance: app, ctx });
  refreshGraph();
}
