import type { HookComponentEventArgs, VueAppInternals } from "../types/vue-internals";

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

export function setupHmrHook(
  hook: any,
  originalEmit: Function,
  onHmrScan: (vueApp: { _instance: any }, hmrId: string, instance: any) => void,
): void {
  hook.emit = function (event: string, ...args: unknown[]) {
    if (
      (event === "component:added" || event === "component:updated") &&
      pendingHmrIds.size > 0
    ) {
      const [vueApp, , , instance] = args as HookComponentEventArgs;
      const hmrId: string | undefined = (instance?.type as any)?.__hmrId;
      if (hmrId && pendingHmrIds.has(hmrId)) {
        pendingHmrIds.delete(hmrId);
        onHmrScan(vueApp, hmrId, instance);
      }
    }
    return originalEmit(event, ...args);
  };
}
