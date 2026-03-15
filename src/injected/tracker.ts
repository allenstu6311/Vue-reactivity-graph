import { GraphNode, notifyUpdate } from "../graph";
import type {
  ComputedRefImpl,
  RawSetupState,
  TrackedTarget,
  TrackEvent,
} from "../types/vue-internals";

// WeakMap：避免把 __node reference 直接掛在 Vue 物件上造成循環引用
export const valNodeMap = new WeakMap<object, GraphNode>();
// WeakMap：props raw object → Map<propKey, GraphNode>
export const propKeyNodeMap = new WeakMap<object, Map<string, GraphNode>>();

function buildNode(
  key: string,
  val: ComputedRefImpl | any,
  componentName: string,
  file: string,
): GraphNode {
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

  //_key 是 Pinia store 的內部屬性，用來粗略識別 store 型別
  // 目前以 "store" 作為統一類型名稱，之後需要更精確的判斷邏輯
  if (val?._key) {
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

// Phase 1: 建 node、存 valNodeMap
export function collectSetupState(
  rawSetupState: RawSetupState,
  componentName: string,
  file: string,
  nodes: GraphNode[],
): void {
  console.log("rawSetupState", rawSetupState);
  for (const key in rawSetupState) {
    if (key === "props") continue;
    const val = rawSetupState[key];

    if (typeof val !== "object" || val === null) continue;

    // const existingNode = valNodeMap.get(val);
    // if (existingNode) {
    //   // 這個 val 已經被父層（或 store）註冊過
    //   // → 這是 inject 來的，直接建連結就好
    //   // 不用建新 node，existingNode 就是來源
    //   return;
    // }

    //onTrack 只拿得到 event.target（響應式物件本身），無法直接得知變數名
    // 直接將 key 掛在物件上，讓 onTrack 能取得對應的 varName
    val.__vrg_depKey = key;
    const node = buildNode(key, val, componentName, file);
    valNodeMap.set(val, node);
    nodes.push(node);
  }
}

// Phase 2: 設 onTrack + 觸發 computed
export function bindSetupTrack(
  rawSetupState: RawSetupState,
  componentName: string,
): void {
  for (const key in rawSetupState) {
    const val = rawSetupState[key];

    if (val?.fn) {
      val.onTrack = (event: TrackEvent) => {
        const subNode = valNodeMap.get(val as object)!;
        console.log("event", event);
        console.log("subNode", subNode);
        //Pinia store 的 state 物件沒有 __vrg_depKey，fallback 用 event.key（被存取的屬性名）當作 dep 名稱
        const depName = event.target.__vrg_depKey ?? String(event.key);
        if (!subNode.deps.includes(depName)) subNode.deps.push(depName);

        const depNode =
          valNodeMap.get(event.target as object) ||
          valNodeMap.get(rawSetupState[depName] as object) ||
          propKeyNodeMap.get(event.target as object)?.get(String(event.key));
        console.log("depNode", depNode);
        if (depNode) {
          const subName =
            depNode.type === "prop" ? `${componentName}.${key}` : key;
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
