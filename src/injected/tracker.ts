import { GraphNode, notifyUpdate } from "../graph";
import type {
  ComputedRefImpl,
  OnTrackEvent,
} from "../types/vue-internals";
import { resolveDepName, resolveDepNode } from "./helper/resolve";
import type { BindSetupTrackParams } from "./helper/types";

function markComputedDirtyAndEval(val: ComputedRefImpl): void {
  val.flags |= 1 << 4;
  val.flags &= ~(1 << 7);
  val.globalVersion = -1;
  val.value;
}





// Phase 2: 設 onTrack + 觸發 computedImpl
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
    const computedImpl = val as ComputedRefImpl

    if (computedImpl?.effect) {
      const subNode = valNodeMap.get(computedImpl as object);
      if (!subNode || subNode.type === "store") continue;

      computedImpl.onTrack = (event: OnTrackEvent) => {
        const subNode = valNodeMap.get(computedImpl as object)!;
        if (!subNode) return;

        // storeToRefs wrapper computedImpl 執行時會先存取 storeProxy 再存取 internal computedImpl
        // storeProxy 本身不是我們追蹤的節點，直接跳過，避免 setupStateVal 反查到自己
        // if (isPiniaStoreProxy(event.target as object)) return;

        const depName = resolveDepName(
          event.target as object,
          event.key,
          propKeyNodeMap,
          valNodeMap,
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

      markComputedDirtyAndEval(computedImpl);
    }
  }
}
