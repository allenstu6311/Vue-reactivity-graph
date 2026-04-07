import { GraphNode, notifyUpdate } from "../graph";
import type {
  ComputedRefImpl,
  RawSetupState,
  TrackEvent,
  Data,
} from "../types/vue-internals";

function forceComputedEval(val: ComputedRefImpl): void {
  val.flags |= 1 << 4;
  val.flags &= ~(1 << 7);
  val.globalVersion = -1;
  val.value;
}

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
  namespace: string,
  file: string,
): GraphNode | null {
  const id = `${namespace}.${key}`;

  //val.fn 是 Vue 3.5 ComputedRefImpl 的內部 getter，未公開 API，用來識別 computed
  if (val?.effect) {
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
  namespace: string;
  file: string;
  nodes: GraphNode[];
  valNodeMap: WeakMap<object, GraphNode>;
  skipKeys?: Set<string>;
  storeComputedKeySet?: Set<string>;
}

// Phase 1: 建 node、存 valNodeMap
export function collectSetupState({
  rawSetupState,
  namespace,
  file,
  nodes,
  valNodeMap,
  skipKeys,
  storeComputedKeySet,
}: CollectSetupStateParams): void {
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue;
    const val = rawSetupState[key];

    if (typeof val !== "object" || val === null) continue;
    if (isPiniaStore(val)) continue;
    if (valNodeMap.has(val)) continue;

    // storeToRefs wrapper computed：mini-trigger 識別對應的 store node，不建新節點
    if ((val as any)?.effect && storeComputedKeySet?.has(key)) {
      let foundStoreNode: GraphNode | undefined;
      const savedOnTrack = (val as any).onTrack;

      (val as any).onTrack = (event: TrackEvent) => {
        const node = valNodeMap.get(event.target as object);
        if (node?.type === "store") foundStoreNode = node;
      };
      forceComputedEval(val as unknown as ComputedRefImpl);
      (val as any).onTrack = savedOnTrack;
      if (foundStoreNode) {
        val.__vrg_depKey = `${foundStoreNode.id}`;
        valNodeMap.set(val, foundStoreNode);
        continue;
      }
    }

    
    //onTrack 只拿得到 event.target（響應式物件本身），無法直接得知變數名
    // 直接將 key 掛在物件上，讓 onTrack 能取得對應的 varName
    val.__vrg_depKey = key;


    const node = buildNode(key, val, namespace, file);
    if (node) {
      valNodeMap.set(val, node);
      nodes.push(node);
    }
  }
}

export function collectPiniaState(
  pinia: any,
  nodes: GraphNode[],
  valNodeMap: WeakMap<object, GraphNode>,
): void {
  if (!pinia?._s) return;
  pinia._s.forEach((store: any) => {
    const storeId: string = store.$id;
    const raw = store.__v_raw ?? store;
    for (const key in raw) {
      if (key.startsWith("$") || key.startsWith("_")) continue;
      const val = raw[key];
      if (typeof val !== "object" || val === null) continue;
      val.__vrg_depKey = `${storeId}.${key}`;
      const node: GraphNode = {
        id: `${storeId}.${key}`,
        varName: key,
        type: "store",
        val,
        file: storeId,
        deps: [],
        subs: [],
      };
      valNodeMap.set(val, node);
      nodes.push(node);
    }
  });
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

interface ResolveDepNodeParams {
  target: object;
  key: string | symbol;
  depName: string | undefined;
  rawSetupState: object | undefined;
  valNodeMap: WeakMap<object, GraphNode>;
  propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>;
  injectRawToLocalNode: Map<object, GraphNode>;
}

export function resolveDepNode({
  target,
  key,
  depName,
  rawSetupState,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
}: ResolveDepNodeParams): GraphNode | undefined {
  const stateVal =
    depName && rawSetupState
      ? (rawSetupState as Record<string, unknown>)[depName]
      : undefined;
  return (
    // target 是當前 component 的 inject 值；per-component 區域 Map，不污染全域 valNodeMap
    injectRawToLocalNode.get(target) ||
    // target 就是響應式物件本身（ref / reactive / computed / pinia store 內部值）
    valNodeMap.get(target) ||
    // Pinia store fallback：target 是 rawStore，改用 rawSetupState[depName] 查 valNodeMap
    (stateVal && typeof stateVal === "object"
      ? valNodeMap.get(stateVal as object)
      : undefined) ||
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
      const subNode = valNodeMap.get(val as object);
      if (!subNode || subNode.type === "store") continue;

      val.onTrack = (event: TrackEvent) => {
        const subNode = valNodeMap.get(val as object)!;
        if (!subNode) return;

        const depName = resolveDepName(
          event.target as object,
          event.key,
          propKeyNodeMap,
        );
        if (!depName) return;

        const depNode = resolveDepNode({
          target: event.target as object,
          key: event.key,
          depName,
          rawSetupState,
          valNodeMap,
          propKeyNodeMap,
          injectRawToLocalNode,
        });

        if (depNode) {
          if (!subNode.deps.includes(depNode.id)) subNode.deps.push(depNode.id);

          // prop / inject 的 subscriber 跨 component 查找時需要完整 ID
          if (depNode.type === "prop" || depNode.type === "inject") {
            const subName =
              depNode.type === "prop" || depNode.type === "inject"
                ? `${componentName}.${key}`
                : key;
            if (!depNode.subs.includes(subName)) depNode.subs.push(subName);
          } else {
            if (!depNode.subs.includes(subNode.id))
              depNode.subs.push(subNode.id);
          }
        }
        notifyUpdate();
      };

      forceComputedEval(val);
    }
  }
}
