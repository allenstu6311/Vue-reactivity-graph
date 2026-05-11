import type { CollectWatchParams } from "./types";

export function collectWatch(params: CollectWatchParams): void {
  const { instance, uid, name, path, file, nodes, watchEffects } = params;

  if (!watchEffects || watchEffects.length === 0) return;

  watchEffects.forEach((_effect, index: number) => {
    nodes.push({
      id: `${uid}.w_${index}`,
      uid,
      name,
      path,
      varName: `w_${index}`,
      type: "watch",
      val: null,
      file,
      deps: [],
      subs: [],
    });
  });
}
