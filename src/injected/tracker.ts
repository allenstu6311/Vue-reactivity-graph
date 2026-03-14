import { GraphNode, notifyUpdate } from "../types/graph";
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

  if (val?.fn) {
    return { id, varName: key, type: "computed", val, file, deps: [], subs: [] };
  }

  if (val?._key) {
    return { id, varName: key, type: "store", val, file, deps: [], subs: [] };
  }

  if (val?.dep) {
    return { id, varName: key, type: "ref", val, file, deps: [], subs: [] };
  }

  if (val?.setup) {
    return { id, varName: key, type: "component", val, file, deps: [], subs: [] };
  }

  // reactive proxy — snapshot，過濾 Vue internal 和 __tracker_name
  const snapshot = Object.fromEntries(
    Object.entries(val as unknown as Record<string, unknown>).filter(
      ([k]) => !k.startsWith("__v_") && k !== "__tracker_name",
    ),
  );

  return { id, varName: key, type: "reactive", val: snapshot, file, deps: [], subs: [] };
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

    if(typeof val !== 'object' || val === null) continue;
    val.__tracker_name = key;

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
        console.log('event', event);
        console.log("subNode", subNode);
        const depName = event.target.__tracker_name ?? String(event.key);
        if (!subNode.deps.includes(depName)) subNode.deps.push(depName);

        const depNode =
          valNodeMap.get(event.target as object) ||
          valNodeMap.get(rawSetupState[depName] as object) ||
          propKeyNodeMap.get(event.target as object)?.get(String(event.key));
        console.log('depNode', depNode);
        if (depNode) {
          const subName =
            depNode.type === "prop" ? `${componentName}.${key}` : key;
          if (!depNode.subs.includes(subName)) depNode.subs.push(subName);
        }

        notifyUpdate();
      };

      val.flags |= 1 << 4;
      val.flags &= ~(1 << 7);
      val.globalVersion = -1;
      val.value;
    }
  }
}
