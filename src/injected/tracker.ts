import { GraphNode, notifyUpdate } from "../types/graph";
import type { ComputedRefImpl, RawSetupState, TrackedTarget, TrackEvent } from "../types/vue-internals";

// WeakMap：避免把 __node reference 直接掛在 Vue 物件上造成循環引用
export const valNodeMap = new WeakMap<object, GraphNode>()

function buildNode(key: string, val: ComputedRefImpl | any, componentName: string, file: string): GraphNode {
  const id = `${componentName}.${key}`;

  if (val?.fn) {
    return { id, type: 'computed', val, file, deps: [], subs: [] };
  }

  if (val?.dep) {
    return { id, type: 'ref', val, file, deps: [], subs: [] };
  }

  // reactive proxy — snapshot，過濾 Vue internal 和 __tracker_name
  const snapshot = Object.fromEntries(
    Object.entries(val as unknown as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('__v_') && k !== '__tracker_name')
  );
  return { id, type: 'reactive', val: snapshot, file, deps: [], subs: [] };
}

export function trackSetupState(
  rawSetupState: RawSetupState,
  componentName: string,
  file: string,
  nodes: GraphNode[],
): void {
  // Loop 1: 標記 __tracker_name + 建 node + 存進 WeakMap
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    val.__tracker_name = key;

    const node = buildNode(key, val, componentName, file);
    valNodeMap.set(val, node);
    nodes.push(node);
  }

  // Loop 2: 對 computed 設 onTrack
  for (const key in rawSetupState) {
    const val = rawSetupState[key];

    if (val?.fn) {
      // let lastTrackId = -1;

      val.onTrack = (event: TrackEvent) => {
        const subNode = valNodeMap.get(val as object)!;

        // 新一輪 run — 先清掉舊的 deps / subs
        // if (val._trackId !== lastTrackId) {
        //   subNode.deps.forEach(depName => {
        //     const depNode = valNodeMap.get(rawSetupState[depName] as object);
        //     if (depNode) {
        //       depNode.subs = depNode.subs.filter(s => s !== key);
        //     }
        //   });
        //   subNode.deps = [];
        //   lastTrackId = val._trackId ?? -1;
        // }
        const depName = event.target.__tracker_name ?? String(event.key);
        if (!subNode.deps.includes(depName)) subNode.deps.push(depName);

        const depNode = valNodeMap.get(event.target as object) || valNodeMap.get(rawSetupState[depName] as object)
        if (depNode && !depNode.subs.includes(key)) {
          depNode.subs.push(key)
        };

        notifyUpdate();
      };

      val.flags |= 1 << 4;
      val.flags &= ~(1 << 7);
      val.globalVersion = -1;
      val.value;
    }
  }
}
