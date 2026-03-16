import { collectInstance, triggerInstance } from "./walker";
import type { ExtendedComponentInstance } from "../types/vue-internals";
import { getGraph, setOnUpdate } from "../graph";
import type { NodeType } from "../graph";

interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null;
  };
}

const appEl = document.querySelector("#app") as
  | (Element & VueAppInternals)
  | null;
const app = appEl?.__vue_app__?._instance;
const hmr = (window as any).__VUE_HMR_RUNTIME__;

const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
const originalEmit = hook.emit.bind(hook);
let pendingReloadId: string | null = null;

if (app) {
  const graph = getGraph();

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
      Object.entries(graph).map(([comp, nodes]) => [
        comp,
        nodes.map((n) => ({
          ...n,
          val: sanitizeVal(n.val, n.type),
        })),
      ]),
    );
    (window as unknown as Record<string, unknown>).__vueReactivityGraph = plain;
    window.postMessage({ type: "VUE_GRAPH_UPDATE" }, "*");
  }

  if (hmr) {
    const originalReload = hmr.reload;

    hmr.reload = function (id: string, newComp: any) {
      pendingReloadId = id;
      return originalReload.call(this, id, newComp);
    };
  }

  hook.emit = function (event: string, ...args: any[]) {
    if (event === "component:added" && pendingReloadId !== null) {
      const [app, uid, parentUid, instance] = args;
      // 比對 __hmrId 確認是同一個 component
      if (instance?.type?.__hmrId === pendingReloadId) {
        collectInstance(instance);
        triggerInstance(instance);
        refreshGraph();
        pendingReloadId = null;
      }
    }
    return originalEmit(event, ...args);
  };

  setOnUpdate(refreshGraph);
  collectInstance(app);
  triggerInstance(app);
  refreshGraph();
}
