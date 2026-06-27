---
name: vue-tracking-setup-state
description: Vue Reactivity Graph 插件的 setupState 追蹤知識。說明如何識別 component setupState 裡的 ref / reactive / computed，以及 valNodeMap（WeakMap<rawObject, GraphNode>）的建立與查找方式。涉及 collectSetupState、bindSetupTrack、onTrack event 處理、valNodeMap 查找邏輯時載入。
---

<!-- 正本：docs/tracking/setup-state.md（單一真相；本檔僅摘要 + 指標，請勿在此重複維護內容）-->

# Tracking: setupState（摘要）

**完整說明見 [`docs/tracking/setup-state.md`](../../../docs/tracking/setup-state.md)，需細節時用 Read 載入該檔。**

重點索引：
- 每個 component 自建的 ref/reactive/computed 物件引用天生唯一，`valNodeMap: WeakMap<rawObject, GraphNode>` 的 `event.target` 直接命中，無衝突。
- **collectSetupState 識別順序**：`isStoreToRefsRef → isComputed → isRef → isReactive`（ObjectRefImpl 也滿足 isRef，必須先攔 storeToRefs，否則誤分類）。
- key 須用 `toRaw()` 取得，proxy 與 raw 才命中同一節點。
- `resolveDepNode` 整體查找順序見 inject 正本。
