import { traverse } from "./walker";
import type { ExtendedComponentInstance } from "../types/vue-internals";
import { getGraph, setOnUpdate } from "../types/graph";
import type { NodeType } from "../types/graph";

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
        return (val as any)?._value;
      case "reactive":
        return { ...(val as object) };
      case "watch":
        return "";
    }
  }

  function refreshGraph() {
    const plain = Object.fromEntries(
      Object.entries(graph).map(([comp, nodes]) => [
        comp,
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          file: n.file,
          val: sanitizeVal(n.val, n.type),
          deps: n.deps,
          subs: n.subs,
        })),
      ]),
    );
    // console.log('plain', plain)
    (window as unknown as Record<string, unknown>).__vueReactivityGraph = plain;
    // window.postMessage({ type: 'VUE_GRAPH_UPDATE' }, '*')
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
        traverse(instance);
        refreshGraph();
        pendingReloadId = null;
      }
    }
    return originalEmit(event, ...args);
  };

  setOnUpdate(refreshGraph);
  traverse(app);
  refreshGraph();
}
