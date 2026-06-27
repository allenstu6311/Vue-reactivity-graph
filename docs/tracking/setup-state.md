# Tracking: setupState（ref / reactive / computed）

每個 component instance 自己建立的 ref/reactive/computed，物件引用天生唯一。

- `valNodeMap: WeakMap<rawObject, GraphNode>`
- `event.target` 直接命中，沒有衝突問題
- key 須用 `toRaw()` 取得，proxy 與 raw 才會命中同一個節點

## collectSetupState 識別順序

遍歷 `instance.setupState`，對每個 value 依序判斷型別（順序不可換）：

```
isStoreToRefsRef(val)               → ObjectRefImpl（Pinia storeToRefs state）→ 交 pinia 路徑
isComputed(val)                     → ComputedRefImpl → type: 'computed'
isRef(val)                          → RefImpl        → type: 'ref'
isReactive(val) && !isReadonly(val) → reactive       → type: 'reactive'
```

順序很重要：ObjectRefImpl 也滿足 `isRef`，必須先用 `isStoreToRefsRef` 攔下，否則會被誤分類成一般 ref。

> `valNodeMap` 在整體 `resolveDepNode` 查找鏈中的位置，見 [inject.md](./inject.md) 的「resolveDepNode 查找順序」。
