---
name: vue-tracking-props
description: Vue Reactivity Graph 插件的 prop 來源追蹤知識。涵蓋 value-backed navigating sentinel、dry-run 試跑 render、traverseVNodeForSentinels、instanceChildPropKeyMap、propKeyNodeMap、prop→prop 轉傳。涉及 prop 連結 GraphNode、sentinel dry-run 時載入。
---

<!-- 正本：docs/tracking/props.md（單一真相；本檔僅摘要 + 指標，請勿在此重複維護內容）-->

# Tracking: Props（摘要）

**完整說明見 [`docs/tracking/props.md`](../../../docs/tracking/props.md)，需細節時用 Read 載入該檔。**

機制一句話：透過 **dry-run（試跑 render）+ value-backed navigating sentinel** 追蹤每個子元件 prop 來自父層哪個變數。

重點索引：
- **rawPropsObj 當 key**：`propKeyNodeMap: WeakMap<rawPropsObj, Map<propName, GraphNode>>`，解決 ref 傳 prop 被 unwrap 成 primitive 無法當 key。
- **navigating sentinel**：callable Proxy，帶 `chain`（走過的真實值）+ `rootKey`；get 往下導航、apply 不 crash、`__v_*`/`toPrimitive` 防偽裝。存於 `sentinelRegistry`。
- **dry-run**：替換 `setupState`/`props` 為 sentinel proxy → 跑 `render()` → `traverseVNodeForSentinels` 掃 VNode 樹（Branch B 逐 prop、Branch A v-bind 整包）；`resolveChain` 由 chain 反查來源節點。**必須排在 collectInject + collectSetup 之後**。
- **結果**：`instanceChildPropKeyMap`（父 instance → 子組件 → `{maps[], nextIndex}`）；collectProps 消費時主路徑查 `nodeIdMap`，prop 轉傳走 `props.` 前綴查父層 `propKeyNodeMap`。
- **已知瓶頸**：v-bind 巢狀不遞迴；多個 v-bind 走 mergeProps 改由 Branch B 處理。
