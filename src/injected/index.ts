import {
  runScan,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import { patchHmrRuntime } from "./hmr";
import { HookChangeSource } from "./HookChangeSource";
import type { VueAppInternals } from "../types/vue-internals";
import { getGraphData, setOnUpdate } from "../graph";
import { snapshot } from "./helper/nodes";

const appEl = document.querySelector("#app") as
  | (Element & VueAppInternals)
  | null;
const getRoot = () => appEl?.__vue_app__?._instance;
const root = getRoot();
const hmr = (window as any).__VUE_HMR_RUNTIME__;

if (root) {
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

  // 更新邏輯：動態讀取 root，nullish 早退，finally 清 override
  const onChange = () => {
    try {
      const cur = getRoot();
      if (!cur) return;
      runScan(cur, ctx);
      refreshGraph();
    } finally {
      ctx.hmrOverrideMap.clear();
    }
  };

  if (hmr) patchHmrRuntime(hmr);

  // 有 hook 才接線來源模組，無 hook 不自建、不 throw
  const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) {
    new HookChangeSource(hook, ctx).setOnChange(onChange);
  }

  setOnUpdate(refreshGraph);
  runScan(root, ctx);
  refreshGraph();
}
