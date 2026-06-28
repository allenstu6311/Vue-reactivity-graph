import type { CollectWatchParams } from "./types";
import type { WalkContext } from "../context/WalkContext";
import { createNode, registerNode } from "../helper/nodes";

export function collectWatch(params: CollectWatchParams & { ctx: WalkContext }): void {
  const { instance, uid, name, path, filePath, nodes, watchEffects, ctx } = params;

  if (!watchEffects || watchEffects.length === 0) return;

  watchEffects.forEach((_effect, index: number) => {
    const watchNode = createNode({
      id: `${uid}.w_${index}`,
      uid,
      name,
      path,
      varName: `watch`,
      type: "watch",
      val: null,
      filePath,
    });
    registerNode(nodes, ctx, watchNode);
  });
}
