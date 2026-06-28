import type { CollectPropsParams } from "./types";
import type { GraphNode } from "../../graph";
import { createNode, registerNode } from "../helper/nodes";
import { linkNodes } from "../subscribers/shared";

// Strategy 1：同名查找（父層 setupState 同名值 → valNodeMap.get）
// Strategy 2：sentinel dry-run 結果（ctx.instanceChildPropKeyMap.get(instance.parent)）
// Strategy 3：v-bind 整包展開（由 traverseVNodeForSentinels Branch A 處理）
export function collectProps(params: CollectPropsParams): void {
  const { instance, uid, name, path, filePath, nodes, ctx, propsOptions, parentRawSetupState } = params;
  if (!propsOptions) return;

  const rawPropsObj = ((instance.props as any).__v_raw ??
    instance.props) as object;
  /**
   * 【本層名冊】本實例的 propName → **prop 節點(GraphNode)**。
   * 先空著掛進 `ctx.propKeyNodeMap`（傳參考），下方迴圈再逐一填入；供 Phase 2 onTrack 反查。
   */
  const propNodeMap = new Map<string, GraphNode>();
  ctx.propKeyNodeMap.set(rawPropsObj, propNodeMap);

  /** 【偵察情報】父層 dry-run 結果（= sentinel.ts 的 `dryRunChildPropMap`），以父 instance 取出。 */
  const parentSentinelResult = instance.parent
    ? ctx.instanceChildPropKeyMap.get(instance.parent)
    : undefined;

  /** 【偵察情報】本型子組件的多實例容器 `{ maps[], nextIndex }`；`maps[instanceOrdinal]` 是本實例那張 (propName→來源id)。 */
  const siblingPropMaps = parentSentinelResult?.get(
    instance.type as unknown as object,
  );

  const instanceOrdinal = siblingPropMaps?.nextIndex ?? 0;
  if (siblingPropMaps) siblingPropMaps.nextIndex++;

  for (const propKey in propsOptions) {
    const propNode = createNode({
      id: `${uid}.${propKey}`,
      uid,
      name,
      path,
      varName: propKey,
      type: "prop",
      val: (instance.props as Record<string, unknown>)[propKey],
      filePath,
    });

    registerNode(nodes, ctx, propNode);
    propNodeMap.set(propKey, propNode);

    // 連結父層 node（父層已在 Phase 1 先被蒐集）
    let parentNode: GraphNode | undefined;

    // sentinel dry-run prop map
    const sourceKey = siblingPropMaps?.maps[instanceOrdinal]?.get(propKey);

    if (sourceKey) {
      if (sourceKey.startsWith("props.") && instance.parent?.props) {
        // props 轉傳：props.test => test
        const parentPropKey = sourceKey.slice(6);
        const parentRawPropsObj = (instance.parent.props.__v_raw ??
          instance.parent.props) as object;
        parentNode = ctx.propKeyNodeMap
          .get(parentRawPropsObj)
          ?.get(parentPropKey);
      } else {
        // 主路徑：sourceKey 是 node.id（resolveChain 在 dry-run 當場解析出來的）→ 直接查 nodeIdMap
        parentNode = ctx.nodeIdMap.get(sourceKey);

        // ── 舊式「同名反查」後備：已停用（先註解、暫不刪除，保留供日後參考）───────────────
        // 觸發條件：sourceKey 是純名字（無 "."、非 "props."），代表 resolveChain 當時沒解析到節點、
        // 只存了 rootKey。但在現行順序（dry-run 排在 collectInject + collectSetup 之後）下，
        // resolveChain 對所有 setup 來源都會成功並存 node.id、prop 轉傳走上方 "props." 分支，
        // 因此這條後備永遠不會被命中（實測停用後 137 測試仍全綠）。
        // 僅在「dry-run 被錯置到建節點之前」這種壞順序下才會生效，屬防禦性殘留，故先停用觀察。
        // parentRawSetupState 也因此暫無消費者（plumbing 保留未刪，故 destructure 仍留著該欄位）。
        // if (!parentNode && parentRawSetupState && !sourceKey.includes(".") && !sourceKey.startsWith("props.")) {
        //   const sourceRaw = (parentRawSetupState as any)[sourceKey];
        //   if (sourceRaw)
        //     parentNode =
        //       ctx.propSourceInjectMap.get(sourceRaw) ?? ctx.valNodeMap.get(sourceRaw);
        // }
      }
    }

    if (parentNode) {
      linkNodes(parentNode, propNode);
    }
  }
}
