# Tracking: setupState（ref / reactive / computed）

每個 component instance 自己建立的 ref/reactive/computed，物件引用天生唯一。

- `valNodeMap: WeakMap<rawObject, GraphNode>`
- `event.target` 直接命中，沒有衝突問題
