import { GraphNode } from "../types/graph";
import type { ComputedRefImpl, RawSetupState, TrackEvent } from "../types/vue-internals";

function buildNode(key: string, val: ComputedRefImpl, componentName: string, file: string): GraphNode {
  const id = `${componentName}.${key}`;

  if (val?.fn) {
    return { id, type: 'computed', val: val.value, file, deps: [], subs: [] };
  }
  if (val?._rawValue !== undefined) {
    return { id, type: 'ref', val: val._rawValue, file, deps: [], subs: [] };
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
  // Loop 1: 標記 __tracker_name，讓 onTrack 的 event.target 能識別變數
  for (const key in rawSetupState) {
    const val = rawSetupState[key];
    val.__tracker_name = key;

    if (val._rawValue && typeof val._rawValue === "object") {
      val._rawValue.__tracker_name = key;
    }
  }

  // Loop 2: 預先建好所有 nodes
  for (const key in rawSetupState) {
    nodes.push(buildNode(key, rawSetupState[key], componentName, file));
  }

  // Loop 3: 對 computed 設 onTrack，找已存在的 node 更新 deps / subs
  for (const key in rawSetupState) {
    const val = rawSetupState[key];

    if (val?.fn) {
      val.onTrack = (event: TrackEvent) => {
        const subscriberName = key;
        const depName = event.target.__tracker_name || String(event.key);

        const subNode = nodes.find(n => n.id === `${componentName}.${subscriberName}`);
        if (subNode && !subNode.deps.includes(depName)) {
          subNode.deps.push(depName);
        }

        const depNode = nodes.find(n => n.id === `${componentName}.${depName}`);
        if (depNode && !depNode.subs.includes(subscriberName)) {
          depNode.subs.push(subscriberName);
        }
      };

      val.flags |= 1 << 4;
      val.flags &= ~(1 << 7);
      val.globalVersion = -1;
      val.value;
    }
  }
}
