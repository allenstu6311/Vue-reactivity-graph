import {
  runScan,
  collectInstance,
  triggerInstance,
} from "./walker";
import { WalkContext } from "./context/WalkContext";
import { patchHmrRuntime, setupHmrHook } from "./hmr";
import type { VueAppInternals, ExtendedComponentInstance } from "../types/vue-internals";
import { getGraphData, setOnUpdate } from "../graph";
import { snapshot } from "./helper/nodes";

const ctx = new WalkContext();
let setupDone = false;

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

// 一次性安裝：HMR 攔截 + onUpdate；setupDone 防重入，避免反覆包裝 hook.emit 爆 stack
function setupOnce(): void {
  if (setupDone) return;
  setupDone = true;

  const hmr = (window as any).__VUE_HMR_RUNTIME__;
  const hook = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  const originalEmit: Function = hook?.emit?.bind(hook) ?? (() => {});

  if (hmr) patchHmrRuntime(hmr);
  if (hook) {
    setupHmrHook(
      hook,
      originalEmit,
      (vueApp, hmrId, instance) => {
        ctx.hmrOverrideMap.set(hmrId, instance);
        try {
          runScan(vueApp._instance, ctx);
          refreshGraph();
        } finally {
          ctx.hmrOverrideMap.delete(hmrId);
        }
      },
      onComponentAdded,
    );
  }

  setOnUpdate(refreshGraph);
}

// ── MVP：事件驅動增量收集 ──────────────────────────────────
// 初始掃一次已 mount 的樹，之後晚 mount 的子樹（導航後的 RouterView 內容）
// 靠 component:added 事件增量補上，不重掃、不 clearGraph → 已捕捉的連結不被打斷。
const pendingAdds: ExtendedComponentInstance[] = [];
let flushScheduled = false;

function onComponentAdded(instance: ExtendedComponentInstance): void {
  if (!instance) return;
  // 初始掃描或先前增量已收過 → 不重複（避免重新 trigger 已捕捉的 computed）
  if (getGraphData().components[String(instance.uid)]) return;
  pendingAdds.push(instance);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flushAdds, 200);
  }
}

function flushAdds(): void {
  flushScheduled = false;
  // 只留還沒進 graph 的
  let batch = pendingAdds.filter(
    (i) => i && !getGraphData().components[String(i.uid)],
  );
  pendingAdds.length = 0;

  // top-down 處理：每輪只收 parent 已在 graph（或 root）的，
  // collectInstance 會 DFS 遞迴納入整顆子樹，後續事件就會被 dedup 跳過。
  let progress = true;
  while (batch.length && progress) {
    progress = false;
    const next: ExtendedComponentInstance[] = [];
    for (const inst of batch) {
      if (getGraphData().components[String(inst.uid)]) {
        progress = true; // 被某次遞迴收掉了
        continue;
      }
      const parentUid = inst.parent?.uid;
      const parentMeta =
        parentUid != null ? getGraphData().components[String(parentUid)] : undefined;
      if (parentUid == null || parentMeta) {
        const parent = parentMeta
          ? { uid: parentMeta.uid, path: parentMeta.path }
          : undefined;
        console.log(
          "[VRG][MVP] incremental collect uid=", inst.uid,
          "name=", (inst.type as any)?.__name ?? (inst.type as any)?.name,
          "parentUid=", parentUid,
        );
        collectInstance({ rawInstance: inst, parent, ctx });
        triggerInstance({ rawInstance: inst, parent, ctx });
        progress = true;
      } else {
        next.push(inst); // parent 還沒進 graph，下一輪再試
      }
    }
    batch = next;
  }
  if (batch.length) {
    console.warn("[VRG][MVP] 無法定位 parent，延後處理 uid=", batch.map((i) => i.uid));
    pendingAdds.push(...batch);
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flushAdds, 200);
    }
  }
  refreshGraph();
}

// 初始掃描：等 #app 出現掃一次，成功後停止輪詢，之後全靠事件增量。
function initialScan(): boolean {
  const app = (document.querySelector("#app") as (Element & VueAppInternals) | null)
    ?.__vue_app__?._instance;
  if (!app) return false;
  setupOnce();
  runScan(app, ctx);
  refreshGraph();
  return true;
}

const boot = setInterval(() => {
  if (initialScan()) clearInterval(boot);
}, 500);
