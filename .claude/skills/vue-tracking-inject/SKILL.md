---
name: vue-tracking-inject
description: Vue Reactivity Graph 插件的 provide / inject 追蹤知識。說明 shared reference 造成的污染問題，以及解法：injectRawToNodeMap（module-level WeakMap）、injectRawToLocalNode（per-component Map）、anonymous node 建立機制，與 resolveDepNode 查找順序。涉及 inject 追蹤、provideRawToNode、resolveDepNode 時載入。
---

<!-- 正本：docs/tracking/inject.md（單一真相；本檔僅摘要 + 指標，請勿在此重複維護內容）-->

# Tracking: Inject（摘要）

**完整說明見 [`docs/tracking/inject.md`](../../../docs/tracking/inject.md)，需細節時用 Read 載入該檔。**

重點索引：
- **根本問題**：`inject()` 回傳 shared reference（同一個 RefImpl），`event.target` 無法區分是哪個 component。
- **解法（雙 Map）**：`injectRawToNodeMap`（module-level，key 用共用 RefImpl、value 存子層自己的 inject node）+ `injectRawToLocalNode`（per-component，`resolveDepNode` 優先查），避免兄弟 component 互蓋。
- **anonymous node**：provide 值不在 setupState（如 inline `provide('k', ref(42))`）時，在父層建匿名節點。
- **判斷是否真的有 provide**：`instance.provides !== instance.parent?.provides`（prototype chain 繼承）。
- **resolveDepNode 順序**：inject（最優先）→ valNodeMap → Pinia fallback → props。
