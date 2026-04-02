import { GraphNode, notifyUpdate } from "../graph";
import type {
  ComputedRefImpl,
  RawSetupState,
  TrackEvent,
  Data,
} from "../types/vue-internals";

function isPiniaStore(val: unknown): boolean {
  if (
    typeof (val as any)?.$id === "string" &&
    typeof (val as any)?.$patch === "function"
  )
    return true;
  if ((val as any)?._key !== undefined && isPiniaStore((val as any)?._object))
    return true;
  return false;
}

function buildNode(
  key: string,
  val: ComputedRefImpl | any,
  componentName: string,
  file: string,
): GraphNode | null {
  const id = `${componentName}.${key}`;

  //val.fn 是 Vue 3.5 ComputedRefImpl 的內部 getter，未公開 API，用來識別 computed
  if (val?.fn) {
    return {
      id,
      varName: key,
      type: "computed",
      val,
      file,
      deps: [],
      subs: [],
    };
  }

  if (isPiniaStore(val)) {
    return { id, varName: key, type: "store", val, file, deps: [], subs: [] };
  }

  //val.dep 是 Vue 3.5 Ref 內部的 Dep class 實例，用來識別 ref
  if (val?.dep) {
    return { id, varName: key, type: "ref", val, file, deps: [], subs: [] };
  }

  if (val?.setup) {
    return {
      id,
      varName: key,
      type: "component",
      val,
      file,
      deps: [],
      subs: [],
    };
  }

  if (val.__v_isReactive) {
    // reactive proxy — snapshot，過濾 Vue internal 和 __vrg_depKey
    const snapshot = Object.fromEntries(
      Object.entries(val as unknown as Record<string, unknown>).filter(
        ([k]) => !k.startsWith("__v_") && k !== "__vrg_depKey",
      ),
    );

    return {
      id,
      varName: key,
      type: "reactive",
      val: snapshot,
      file,
      deps: [],
      subs: [],
    };
  }

  return null;
}

interface CollectSetupStateParams {
  rawSetupState: Data;
  componentName: string;
  file: string;
  nodes: GraphNode[];
  valNodeMap: WeakMap<object, GraphNode>;
  skipKeys?: Set<string>;
}

// Phase 1: 建 node、存 valNodeMap
export function collectSetupState({
  rawSetupState,
  componentName,
  file,
  nodes,
  valNodeMap,
  skipKeys,
}: CollectSetupStateParams): void {
  // console.log("rawSetupState", rawSetupState);
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue;
    const val = rawSetupState[key];
    if (typeof val !== "object" || val === null) continue;

    //onTrack 只拿得到 event.target（響應式物件本身），無法直接得知變數名
    // 直接將 key 掛在物件上，讓 onTrack 能取得對應的 varName
    val.__vrg_depKey = key;
    const node = buildNode(key, val, componentName, file);
    if (node) {
      valNodeMap.set(val, node);
      nodes.push(node);
    }
  }
}

export function resolveDepName(
  target: object,
  key: string | symbol,
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>,
): string | undefined {
  return (
    (isPiniaStore(target) ? String(key) : undefined) ??
    (target as any).__vrg_depKey ??
    (propKeyNodeMap.has(target) ? String(key) : undefined)
  );
}

export function resolveDepNode(
  target: object,
  key: string | symbol,
  depName: string,
  rawSetupState: RawSetupState,
  valNodeMap: WeakMap<object, GraphNode>,
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>,
  injectRawToLocalNode: Map<object, GraphNode>,
): GraphNode | undefined {
  return (
    // target 是當前 component 的 inject 值；per-component 區域 Map，不污染全域 valNodeMap
    injectRawToLocalNode.get(target) ||
    // target 就是響應式物件本身（ref / reactive / computed）
    valNodeMap.get(target) ||
    // target 是 Pinia store state proxy，不在 valNodeMap，改用 depName 從 setupState 取出原始值再查
    valNodeMap.get(rawSetupState[depName] as object) ||
    // target 是 raw props object；prop 值可能是 primitive 無法當 WeakMap key，所以另開兩層結構
    propKeyNodeMap.get(target)?.get(String(key))
  );
}

interface BindSetupTrackParams {
  rawSetupState: RawSetupState;
  componentName: string;
  valNodeMap: WeakMap<object, GraphNode>;
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>;
  injectRawToLocalNode: Map<object, GraphNode>;
}

// Phase 2: 設 onTrack + 觸發 computed
export function bindSetupTrack({
  rawSetupState,
  componentName,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
}: BindSetupTrackParams): void {

  for (const key in rawSetupState) {
    const val = rawSetupState[key];

    if (val?.fn) {
      val.onTrack = (event: TrackEvent) => {
        const subNode = valNodeMap.get(val as object)!;

        const depName = resolveDepName(event.target as object, event.key, propKeyNodeMap);
        if (!depName) return;
        if (!subNode.deps.includes(depName)) subNode.deps.push(depName);

        const depNode = resolveDepNode(
          event.target as object,
          event.key,
          depName,
          rawSetupState,
          valNodeMap,
          propKeyNodeMap,
          injectRawToLocalNode,
        );
        if (depNode) {
          // prop / inject 的 subscriber 跨 component 查找時需要完整 ID
          const subName =
            depNode.type === "prop" || depNode.type === "inject"
              ? `${componentName}.${key}`
              : key;
          if (!depNode.subs.includes(subName)) depNode.subs.push(subName);
        }

        notifyUpdate();
      };

      //強制 computed 重新計算以觸發 onTrack
      // bit 4 (DIRTY) = 標記為髒值需重算，bit 7 (SSR_RENDER) 清除避免干擾
      // globalVersion = -1 確保版本號過期，讓 Vue 認為此 computed 需要重新求值
      val.flags |= 1 << 4;
      val.flags &= ~(1 << 7);
      val.globalVersion = -1;
      val.value;
    }
  }
}
