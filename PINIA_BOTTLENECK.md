# Pinia storeToRefs computed 追蹤瓶頸

## 問題描述

當 component 透過 `storeToRefs` 取得 Pinia store 的 computed 時，會產生一個 wrapper ComputedRefImpl，導致圖上出現多餘的中間節點 `App.doubleCount`。

## 資料結構差異

### Store 內部（`collectPiniaState` 處理）
```
doubleCount: ComputedRefImpl
  fn: () => count.value * 2   ← 原始 getter
```

### Component rawSetupState（`storeToRefs` 產生）
```
doubleCount: ComputedRefImpl  ← 全新的 wrapper 物件，不是同一個引用
  fn: () => store[key]        ← 包裝 store proxy 存取
```

## ref vs computed 行為差異

### ref（count）
```
app.data1 onTrack → target = ObjectRefImpl → __vrg_depKey = 'count' → counter.count
```
直接找到 store node，沒有中間節點。

### computed（doubleCount）目前錯誤行為
```
app.data1 onTrack → target = wrapper ComputedRefImpl → 建成 App.doubleCount（不應存在）
App.doubleCount onTrack → target = pinia ComputedRefImpl → counter.doubleCount
```
多了一個不必要的中間節點 `App.doubleCount`。

### computed（doubleCount）期望行為
```
app.data1 onTrack → target = wrapper ComputedRefImpl → 直接找到 counter.doubleCount
```

## 解法

`collectSetupState` 遇到 wrapper computed 時（`val?.fn && storeKeySet.has(key)`），不建新 node，改為：

```ts
valNodeMap.set(val, storeKeyToNode.get(key)!)
continue
```

讓 wrapper 直接指向 `counter.doubleCount` 的 node，`data1` 的 onTrack 用 wrapper 查 `valNodeMap` 就能直接找到 store node。

`storeKeyToNode` 建法：遍歷 rawSetupState 裡的完整 store proxy，取 raw 的每個 key，用 `valNodeMap.get(raw[key])` 拿到 `collectPiniaState` 已建好的 node。
