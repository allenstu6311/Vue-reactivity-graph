import {
  runScan,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import { patchHmrRuntime, setupHmrHook } from "./hmr";
import type { VueAppInternals } from "../types/vue-internals";
import { getGraphData, setOnUpdate } from "../graph";
import type { NodeType } from "../graph";

const appEl = document.querySelector("#app") as
  | (Element & VueAppInternals)
  | null;
const app = appEl?.__vue_app__?._instance;
const hmr = (window as any).__VUE_HMR_RUNTIME__;

const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
const originalEmit = hook.emit.bind(hook);

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
    const graphData = getGraphData();
    const plain = {
      components: Object.fromEntries(
        Object.entries(graphData.components).map(([comp, nodes]) => [
          comp,
          nodes.map((n: any) => ({
            ...n,
            // val: sanitizeVal(n.val, n.type),
            val: "", // 暫時不顯示資料
          })),
        ]),
      ),
      stores: Object.fromEntries(
        Object.entries(graphData.stores).map(([storeId, nodes]) => [
          storeId,
          nodes.map((n: any) => ({
            ...n,
            // val: sanitizeVal(n.val, n.type),
            val: "", // 暫時不顯示資料
          })),
        ]),
      ),
    };
    console.log("Updating graph data:", plain);
    (window as unknown as Record<string, unknown>).__vueReactivityGraph = plain;
    window.postMessage({ type: "VUE_GRAPH_UPDATE" }, "*");
  }

  if (hmr) patchHmrRuntime(hmr);
  setupHmrHook(hook, originalEmit, (vueApp, hmrId, instance) => {
    ctx.hmrOverrideMap.set(hmrId, instance);
    try {
      runScan(vueApp._instance, ctx);
      refreshGraph();
    } finally {
      ctx.hmrOverrideMap.delete(hmrId);
    }
  });

  setOnUpdate(refreshGraph);
  runScan(app, ctx);
  refreshGraph();
}
