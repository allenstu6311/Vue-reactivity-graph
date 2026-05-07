import type { CollectWatchParams } from "./types";

export function collectWatch(params: CollectWatchParams): void {
  const { instance, componentName, file, nodes, watchEffects } = params;

  if (!watchEffects || watchEffects.length === 0) return;

  watchEffects.forEach((_effect, index: number) => {
    nodes.push({
      id: `${componentName}.w_${index}`,
      varName: `w_${index}`,
      type: "watch",
      val: null,
      file,
      deps: [],
      subs: [],
    });
  });
}
