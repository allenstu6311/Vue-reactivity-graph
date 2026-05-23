import type { CollectPropsParams } from "./types";
import type { GraphNode } from "../../graph";
import { linkNodes } from "../subscribers/shared";

// Strategy 1：同名查找（父層 setupState 同名值 → valNodeMap.get）
// Strategy 2：sentinel dry-run 結果（ctx.instanceChildPropKeyMap.get(instance.parent)）
// Strategy 3：v-bind 整包展開（由 traverseVNodeForSentinels Branch A 處理）
export function collectProps(params: CollectPropsParams): void {
  const { instance, uid, name, path, filePath, nodes, ctx, propsOptions, parentRawSetupState } = params;

  if (!propsOptions) return;

  const rawPropsObj = ((instance.props as any).__v_raw ??
    instance.props) as object;
  const propMap = new Map<string, GraphNode>();
  ctx.propKeyNodeMap.set(rawPropsObj, propMap);

  const parentSentinelResult = instance.parent
    ? ctx.instanceChildPropKeyMap.get(instance.parent)
    : undefined;

  const siblingPropMaps = parentSentinelResult?.get(
    instance.type as unknown as object,
  );

  const instanceOrdinal = siblingPropMaps?.nextIndex ?? 0;
  if (siblingPropMaps) siblingPropMaps.nextIndex++;

  for (const propKey in propsOptions) {
    const propNode: GraphNode = {
      id: `${uid}.${propKey}`,
      uid,
      name,
      path,
      varName: propKey,
      type: "prop",
      val: (instance.props as Record<string, unknown>)[propKey],
      filePath,
      deps: [],
      subs: [],
    };

    nodes.push(propNode);
    propMap.set(propKey, propNode);

    // 連結父層 node（父層已在 Phase 1 先被蒐集）
    let parentNode: GraphNode | undefined;

    // sentinel dry-run prop map
    const sourceKey = siblingPropMaps?.maps[instanceOrdinal]?.get(propKey);

    if (sourceKey) {
      if (sourceKey.startsWith("props.") && instance.parent?.props) {
        // props.test => test
        const parentPropKey = sourceKey.slice(6);
        const parentRawPropsObj = (instance.parent.props.__v_raw ??
          instance.parent.props) as object;
        parentNode = ctx.propKeyNodeMap
          .get(parentRawPropsObj)
          ?.get(parentPropKey);
      } else if (parentRawSetupState) {
        const sourceRaw = parentRawSetupState[sourceKey];
        if (sourceRaw)
          parentNode =
            ctx.propSourceInjectMap.get(sourceRaw) ?? ctx.valNodeMap.get(sourceRaw);
      }
    }

    if (parentNode) {
      linkNodes(parentNode, propNode);
    }
  }
}
