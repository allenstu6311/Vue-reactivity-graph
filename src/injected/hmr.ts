import type { ExtendedComponentInstance } from "../types/vue-internals";

const pendingHmrIds = new Set<string>();

export function patchHmrRuntime(hmr: any): void {
  if (hmr.__vrg_patched) {
    return;
  }
  hmr.__vrg_patched = true;

  const originalReload = hmr.reload;
  const originalRender = hmr.rerender;

  hmr.reload = function (id: string, _newComp: unknown) {
    pendingHmrIds.add(id);
    return originalReload.call(this, id, _newComp);
  };

  hmr.rerender = function (id: string, _newComp: unknown) {
    pendingHmrIds.add(id);
    return originalRender.call(this, id, _newComp);
  };
}

/**
 * 檢查該 instance 是否命中 pending HMR
 * 命中時回傳 hmrId 並從 pending 移除；未命中回傳 undefined
 *
 * @param instance - component instance
 * @returns hmrId（命中）或 undefined（未命中）
 */
export function consumePendingHmrId(instance: ExtendedComponentInstance): string | undefined {
  const hmrId: string | undefined = (instance?.type as any)?.__hmrId;
  if (hmrId && pendingHmrIds.has(hmrId)) {
    pendingHmrIds.delete(hmrId);
    return hmrId;
  }
  return undefined;
}
