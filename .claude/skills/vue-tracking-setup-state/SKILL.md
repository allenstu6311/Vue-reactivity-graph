---
name: vue-tracking-setup-state
description: Vue Reactivity Graph 插件的 setupState 追蹤知識。說明如何識別 component setupState 裡的 ref / reactive / computed，以及 valNodeMap（WeakMap<rawObject, GraphNode>）的建立與查找方式。涉及 collectSetupState、bindSetupTrack、onTrack event 處理、valNodeMap 查找邏輯時載入。
---

<!-- 來源：docs/tracking/setup-state.md -->

# Tracking: setupState（ref / reactive / computed）

每個 component instance 自己建立的 ref/reactive/computed，物件引用天生唯一。

- `valNodeMap: WeakMap<rawObject, GraphNode>`
- `event.target` 直接命中，沒有衝突問題
