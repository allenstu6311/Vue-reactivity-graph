import {
  runScan,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import { patchHmrRuntime } from "./hmr";
import { HookChangeSource } from "./HookChangeSource";
import type { VueAppInternals } from "../types/vue-internals";
import { getGraphData, setOnUpdate } from "../graph";
import { snapshot } from "./helper/nodes";

// 每次重查 #app：injected 可能在 app mount 前執行，#app 或 __vue_app__ 都可能尚未就緒
const getRoot = () =>
  (document.querySelector("#app") as (Element & VueAppInternals) | null)
    ?.__vue_app__?._instance;

function init(root: NonNullable<ReturnType<typeof getRoot>>) {
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

  const hmr = (window as any).__VUE_HMR_RUNTIME__;
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

// 初次啟動：root 就緒就直接 init；否則輪詢等待 app 掛載（每 100ms，最多 ~5s）。
// 解決 injected 在 app mount 前執行時 root 為 null、整支不啟動的競態。
const existing = getRoot();
if (existing) {
  init(existing);
} else {
  let tries = 0;
  const timer = setInterval(() => {
    const r = getRoot();
    if (r) {
      clearInterval(timer);
      init(r);
    } else if (++tries > 50) {
      clearInterval(timer);
    }
  }, 100);
}
