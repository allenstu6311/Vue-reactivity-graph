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

function isPiniaStoreProxy(val: unknown): boolean {
  return (
    typeof (val as any)?.$id === "string" &&
    typeof (val as any)?.$patch === "function"
  );
}

// storeToRefs 產生的 ObjectRefImpl：_key 是屬性名，_object 是 store proxy
export function isStoreToRefsRef(val: unknown): boolean {
  return (
    (val as any)?._key !== undefined && isPiniaStoreProxy((val as any)?._object)
  );
}

function buildNode(
  key: string,
  val: ComputedRefImpl | any,
  namespace: string,
  file: string,
): GraphNode | null {
  const id = `${namespace}.${key}`;

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

  if (val?.__v_isRef) {
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
  storeValToComponentNode: Map<object, GraphNode>;
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
  storeValToComponentNode,
}: CollectSetupStateParams): void {
  for (const key in rawSetupState) {
    if (key === "props") continue;
    if (skipKeys?.has(key)) continue;
    const val = rawSetupState[key];

    if (typeof val !== "object" || val === null) continue;
    if (isPiniaStoreProxy(val)) continue;
    if (valNodeMap.has(val)) continue;

    // storeToRefs ref/reactive wrapper（ObjectRefImpl）
    // _object 是 store proxy，_key 是屬性名，透過這兩個靜態建立 component node 與 store node 的連結
    if (isStoreToRefsRef(val)) {
      const storeRaw = (val as any)._object?.__v_raw ?? (val as any)._object;
      const storeKey = (val as any)._key;
      const storeVal = storeRaw?.[storeKey];
      const storeNode =
        storeVal && typeof storeVal === "object"
          ? valNodeMap.get(storeVal as object)
          : undefined;

      val.__vrg_depKey = key;
      const componentNode = buildNode(key, val, namespace, file);
      if (componentNode && storeNode) {
        componentNode.deps.push(storeNode.id);
        if (!storeNode.subs.includes(componentNode.id))
          storeNode.subs.push(componentNode.id);
        storeValToComponentNode.set(storeVal as object, componentNode);
        valNodeMap.set(val, componentNode);
        nodes.push(componentNode);
      }
      continue;
    }

    // TODO: storeToRefs wrapper computed（getter）
    // storeToRefs 的 computed getter 產生全新的 wrapper ComputedRefImpl，與 ref/reactive 的 ObjectRefImpl 不同
    // 需要 mini-trigger（forceComputedEval + 暫時覆蓋 onTrack）才能找到對應的 store computed node
    // 目前暫時跳過，待後續實作時應建立 component node 並連結至 store node（同 ref/reactive 的處理方式）
    // if ((val as any)?.effect && storeComputedKeySet?.has(key)) {
    //   let foundStoreNode: GraphNode | undefined;
    //   const savedOnTrack = (val as any).onTrack;
    //   (val as any).onTrack = (event: TrackEvent) => {
    //     const node = valNodeMap.get(event.target as object);
    //     if (node?.type === "store") foundStoreNode = node;
    //   };
    //   forceComputedEval(val as unknown as ComputedRefImpl);
    //   (val as any).onTrack = savedOnTrack;
    //   if (foundStoreNode) {
    //     val.__vrg_depKey = `${foundStoreNode.id}`;
    //     valNodeMap.set(val, foundStoreNode);
    //     continue;
    //   }
    // }

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
    (isPiniaStoreProxy(target) ? String(key) : undefined) ??
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
  storeValToComponentNode?: Map<object, GraphNode>;
}

export function resolveDepNode({
  target,
  key,
  depName,
  rawSetupState,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: ResolveDepNodeParams): GraphNode | undefined {
  const stateVal =
    depName && rawSetupState
      ? (rawSetupState as Record<string, unknown>)[depName]
      : undefined;

  return (
    // storeToRefs ref/reactive wrapper：store 底層值 → component node（優先於 valNodeMap 的 store node）
    storeValToComponentNode?.get(target) ||
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
  storeValToComponentNode: Map<object, GraphNode>;
}

// Phase 2: 設 onTrack + 觸發 computed
export function bindSetupTrack({
  rawSetupState,
  componentName,
  valNodeMap,
  propKeyNodeMap,
  injectRawToLocalNode,
  storeValToComponentNode,
}: BindSetupTrackParams): void {
  for (const key in rawSetupState) {
    const val = rawSetupState[key];

    if (val?.effect) {
      const subNode = valNodeMap.get(val as object);
      if (!subNode || subNode.type === "store") continue;

      val.onTrack = (event: TrackEvent) => {
        const subNode = valNodeMap.get(val as object)!;
        if (!subNode) return;

        // storeToRefs wrapper computed 執行時會先存取 storeProxy 再存取 internal computed
        // storeProxy 本身不是我們追蹤的節點，直接跳過，避免 stateVal 反查到自己
        // if (isPiniaStoreProxy(event.target as object)) return;

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
          storeValToComponentNode,
        });

        // depNode.id === subNode.id：storeToRefs wrapper 自我追蹤的防護
        if (!depNode || depNode.id === subNode.id) return;

        if (!subNode.deps.includes(depNode.id)) subNode.deps.push(depNode.id);

        // prop / inject 的 subs 需要完整的 component-scoped ID 才能跨 component 查找
        // 一般節點用 subNode.id（已含 componentName 前綴），不用 key（只是短名稱）
        const isPropOrInject =
          depNode.type === "prop" || depNode.type === "inject";
        const subName = isPropOrInject ? `${componentName}.${key}` : subNode.id;

        if (!depNode.subs.includes(subName)) depNode.subs.push(subName);
        notifyUpdate();
      };

      forceComputedEval(val);
    }
  }
}
