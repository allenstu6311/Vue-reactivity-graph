---
name: vue-tracking-pinia
description: Vue Reactivity Graph 插件的 Pinia storeToRefs 追蹤知識。說明 ObjectRefImpl / ComputedRefImpl wrapper 的追蹤行為差異：ref state 雙重 onTrack 與 storeValToComponentNode 解法、reactive state onTrack 不觸發問題、computed getter wrapper dep 行為，以及 isPiniaStoreProxy guard。涉及 storeToRefs、isStoreToRefsRef、Pinia store 追蹤時載入。
---

<!-- 正本：docs/tracking/pinia.md（單一真相；本檔僅摘要 + 指標，請勿在此重複維護內容）-->

# Tracking: Pinia storeToRefs（摘要）

**完整說明見 [`docs/tracking/pinia.md`](../../../docs/tracking/pinia.md)，需細節時用 Read 載入該檔。**

重點索引（`storeToRefs` 對 state 包成 ObjectRefImpl、對 getter 包成新 ComputedRefImpl，追蹤行為不同）：
- **ref state**：雙 onTrack（#1 target=storeProxy → guard skip；#2 target=內部 RefImpl）。靠 Phase 1 `isStoreToRefsRef` 靜態建鏈 + `storeValToComponentNode` 讓 onTrack #2 正確連到 component node。鏈：`data → App.x → store.x`。
- **reactive state**：`unref(reactiveProxy)` 不觸發 onTrack → subs 目前無法自動建立（已知瓶頸）。
- **computed**：wrapper 有自己的 dep，單次 onTrack，不穿透看到 storeProxy。
- **共用 guard**：`isPiniaStoreProxy(event.target)` 在 onTrack 最前面攔截 storeProxy。
