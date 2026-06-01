import type { CollectWatchParams } from "./types";
import { createNode } from "../helper/nodes";

export function collectWatch(params: CollectWatchParams): void {
  const { instance, uid, name, path, filePath, nodes, watchEffects } = params;

  if (!watchEffects || watchEffects.length === 0) return;

  watchEffects.forEach((_effect, index: number) => {
    nodes.push(createNode({
      id: `${uid}.w_${index}`,
      uid,
      name,
      path,
      varName: `watch`,
      type: "watch",
      val: null,
      filePath,
    }));
  });
}
