---
name: vue-tracking-pinia
description: Vue Reactivity Graph 插件的 Pinia storeToRefs 追蹤知識。說明 ObjectRefImpl / ComputedRefImpl wrapper 的追蹤行為差異：ref state 雙重 onTrack 與 storeValToComponentNode 解法、reactive state onTrack 不觸發問題、computed getter wrapper dep 行為，以及 isPiniaStoreProxy guard。涉及 storeToRefs、isStoreToRefsRef、Pinia store 追蹤時載入。
---

<!-- 來源：docs/tracking/pinia.md -->

# Tracking: Pinia storeToRefs

以下情境作為說明基礎：

```ts
// store
export const useCounterStore = defineStore('counter', () => {
  const count = ref(899)
  const doubleCount = computed(() => count.value * 2)
  return { count, doubleCount }
})

// component
const testStore = useCounterStore()
const { count, doubleCount } = storeToRefs(testStore)

const data1 = computed(() => `${doubleCount.value} items`)
```

`storeToRefs` 對 state 和 getter 產生不同結構的 wrapper，追蹤行為也不同。

---

## ref（ObjectRefImpl）

`storeToRefs` 將 ref state 包成 `ObjectRefImpl(_object = rawStore, key)`。

`ObjectRefImpl.get value()` 執行：`rawStore[key]` → 取得 RefImpl → `unref(RefImpl)` → 觸發 `trackRefValue(RefImpl)` → **onTrack 觸發，target = 內部 RefImpl**。

**追蹤行為**：`data1` 讀 `count.value` 時，Vue 為 `data1` 產生兩次 onTrack：

```
data1 讀 count.value
  ├─► onTrack #1: target = storeProxy → isPiniaStoreProxy guard → skip
  └─► onTrack #2: target = store 內部 RefImpl → storeValToComponentNode → App.count
```

**問題**：onTrack #2 的 target 在 `valNodeMap` 對應的是 `counter.count`，`data1` 會跳過 `App.count` 直接連到 `counter.count`。

**解法**：Phase 1 `collectSetupState` 識別 ObjectRefImpl（`isStoreToRefsRef`）時，`_object` 和 `_key` 已包含足夠的靜態資訊，不需要等 onTrack 就能直接找到 store 節點，當場確立連結：
- `App.count.deps = ['counter.count']`
- `counter.count.subs = ['App.count']`

同時將 `store 內部 RefImpl → App.count` 存入 `storeValToComponentNode`。Phase 2 onTrack #2 查這張 map 優先於 `valNodeMap`，正確返回 `App.count` 而非 `counter.count`。

最終鏈：`data1 → App.count → counter.count`

---

## reactive（ObjectRefImpl）

`storeToRefs` 將 reactive state 同樣包成 `ObjectRefImpl(_object = rawStore, key)`。

`ObjectRefImpl` constructor 中，因為 `_object = rawStore`（plain object，非 proxy），`isProxy(rawStore) = false` → `_shallow = true`。

`ObjectRefImpl.get value()` 執行：`rawStore[key]` → 取得 reactive proxy → `unref(reactiveProxy)` → reactive proxy 沒有 `__v_isRef` → **直接 return，不觸發 trackRefValue** → **onTrack 不觸發**。

**追蹤行為**：`data1` 讀 `items.value` 時，沒有 onTrack。subs 追蹤依賴 Phase 1 靜態建立：
- `App.items.deps = ['counter.items']`（`isStoreToRefsRef` 路徑，與 ref 相同）
- subs 連結（`counter.items → App.items`，`App.items → data1`）**不經過 onTrack**，需要其他機制

最終鏈（Phase 1 靜態部分）：`App.items → counter.items`（已建立）  
`data1 → App.items`：onTrack 不觸發，**目前無法自動建立**

---

## computed（wrapper ComputedRefImpl）

`storeToRefs` 將 getter 包成全新的 ComputedRefImpl，有自己的 dep。

**追蹤行為**：`data1` 讀 `doubleCount.value` 時，Vue 追蹤的是 wrapper 的 dep，只產生一次 onTrack：

```
data1 讀 doubleCount.value
  └─► onTrack #1: target = App.doubleCount wrapper → App.doubleCount
                                                           └─► counter.doubleCount
```

wrapper 有自己的 dep，`data1` 不會穿透看到 storeProxy 或 internal ComputedRefImpl。

最終鏈：`data1 → App.doubleCount → counter.doubleCount`

---

## 共用解法：isPiniaStoreProxy guard

storeToRefs wrapper 執行時都可能產生 target = storeProxy 的 onTrack，且都不應建立 dep。在 `bindSetupTrack` onTrack 最前面統一攔截：

```ts
if (isPiniaStoreProxy(event.target as object)) return;
```

> **備註**：storeProxy 作為 onTrack target 只在存取 storeToRefs wrapper 時出現。正常的 computed/watch 追蹤 store 資料時，target 是底層的 RefImpl 或 ComputedRefImpl，不會是 storeProxy，因此這個 guard 不影響其他情境。
