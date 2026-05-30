import {
  runScan,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import { patchHmrRuntime, setupHmrHook } from "./hmr";
import type { VueAppInternals } from "../types/vue-internals";
import { getGraphData, setOnUpdate } from "../graph";
import { snapshot } from "./helper/nodes";

const appEl = document.querySelector("#app") as
  | (Element & VueAppInternals)
  | null;
const app = appEl?.__vue_app__?._instance;
const hmr = (window as any).__VUE_HMR_RUNTIME__;

const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
const originalEmit = hook.emit.bind(hook);

if (app) {
  const ctx = new WalkContext();

  function refreshGraph() {
    const graphData = getGraphData();
    const plain = {
      components: graphData.components,
      nodes: Object.fromEntries(
        Object.entries(graphData.nodes).map(([uid, nodes]) => [
          uid,
          nodes.map((n) => ({ ...n, val: snapshot(n.val) })),
        ]),
      ),
      stores: Object.fromEntries(
        Object.entries(graphData.stores).map(([storeId, nodes]) => [
          storeId,
          nodes.map((n) => ({ ...n, val: snapshot(n.val) })),
        ]),
      ),
    };
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
