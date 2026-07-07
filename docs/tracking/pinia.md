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

## store getter Phase 2 追蹤

### 概述

store 內部的 computed getter（如 `computed(() => count.value * 2)`）在 Phase 1 被 `collectPiniaState` 作為節點建立，但**未經過 Phase 2 onTrack 綁定**。本節說明 `bindPiniaGetterTrack` 如何為 store getter 補上「作為訂閱者」的 deps 追蹤。

### onTrack target 四種型態

store getter 強制觸發時，onTrack 可能捕獲以下四種 target：

1. **直接讀 store 內部的 ref**（`RefImpl`）
   ```ts
   const count = ref(0)
   const double = computed(() => count.value * 2)  // target = RefImpl (count 本身)
   ```

2. **讀另一個 store getter**（該 getter 的 `ComputedRefImpl`）
   ```ts
   const getter1 = computed(() => count.value * 2)
   const getter2 = computed(() => getter1.value + 1)  // target = ComputedRefImpl (getter1 本身)
   ```

3. **讀 store 內部的 reactive state**（reactive 的 raw target）
   ```ts
   const state = reactive({ list: [] })
   const derived = computed(() => state.list.length)  // target = raw target of state
   ```

4. **讀另一個 store 的欄位**（跨 store 依賴，target = 被依賴 store 的 raw 容器）
   ```ts
   const storeA = useStoreA()
   const derived = computed(() => storeA.count + 1)  // 第一次 onTrack: target = storeA raw 容器
   ```
   後續會有第二次 onTrack（target = storeA 內部實際的 ref/getter/reactive），才能正確命中 valNodeMap。

### 實作細節

`bindPiniaGetterTrack(pinia, valNodeMap)` 對每個 store 的 getter（`raw[key]` 具有 `.effect` 的 ComputedRefImpl）做以下操作：

1. 檢查 `valNodeMap.get(computedImpl)` 是否命中已建立的節點（Phase 1 登記）
2. 若命中，掛 `onTrack` handler：`createOnTrackHandler(subNode, subNode.id, {...}, { guardSelf: true })`
3. **關鍵參數：`rawSetupState: {}`** — 傳空物件而非 store raw
   - 目的：避免跨 store 存取時，`resolveDepNode` 的 fallback 分支誤用目前處理的 store 自己的 raw，造成同名 key 碰撞誤連結
   - 由於 store 內部自我依賴（type 1-3）完全不依賴 `rawSetupState` fallback，而跨 store 依賴（type 4）的真正 dep 由第二次 onTrack 的 `valNodeMap.get(target)` 直接命中，傳 `{}` 零副作用地消除誤連結風險
4. 強制觸發 getter：`markComputedDirtyAndEval(computedImpl)`，使 onTrack handler 即刻執行

### 已知限制與行為

- **未回傳的私有 ref/reactive**（如 demo 的 `favoriteMarkets = ref([])` 但不 return）：無法被 `collectPiniaState` 登記進 `valNodeMap`。getter 讀取時 onTrack target 無節點對應，`createOnTrackHandler` 的 `if (!depNode) return` 靜默跳過，該筆 dep 缺失，不拋錯、不產生假節點。

- **Setup store getter-to-getter 可正確追蹤**（該 `ComputedRefImpl` 被登記）
  
- **Options store getter-to-state 依賴維持現況不支援**
  - 原因：`storeToRefs`/`toRefs` 產生的 `ObjectRefImpl` 缺少 `__v_raw` 屬性，導致其背後的 state 容器從未被登記進 `valNodeMap`
  - 非本次刻意排除，而是既有的登記缺口

- **Options store getter-to-getter 依賴會被正確追蹤**（新增且正確的行為，可接受）

---

## 共用解法：isPiniaStoreProxy guard

storeToRefs wrapper 執行時產生的 target = storeProxy 的 onTrack，與 store getter 自身執行時產生的 target = store raw 容器的 onTrack，在 `resolveDepName`（`src/injected/helper/resolve.ts`）中由 `isPiniaStoreProxy(target)` 判定，決定是否嘗試以 key 作為 depName：

```ts
return (
  (isPiniaStoreProxy(target) ? String(key) : undefined) ??
  valNodeMap.get(target)?.varName ??
  (propKeyNodeMap.has(target) ? String(key) : undefined)
);
```

當判定為 true 時，繼續嘗試 `resolveDepNode` 的 fallback 分支（`rawSetupState[depName]`），但因為 store getter 傳入的 `rawSetupState: {}`，fallback 必然回傳 undefined，跳過不產生連結。這使得跨 store 的第一層 onTrack（target = store raw 容器）不會產生誤連結，正確的 dep 由第二層 onTrack（target = 內部實際的 ref/getter/reactive）的 `valNodeMap.get(target)` 直接命中。

> **備註**：storeProxy 作為 onTrack target 只在存取 storeToRefs wrapper 時出現。正常的 computed/watch 追蹤 store 資料時，target 是底層的 RefImpl 或 ComputedRefImpl，不會是 storeProxy，因此這個判定路徑不影響其他情境。
