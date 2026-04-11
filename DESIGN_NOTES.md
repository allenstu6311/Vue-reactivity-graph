# Design Notes

本文件記錄 walker / tracker 中各種設計決策

---

## onTrack 的根本限制

`onTrack` 觸發時只提供兩個資訊：

- `event.target`：被存取的響應式物件本身（object reference）
- `event.key`：存取的屬性名

`resolveDepNode` 只能靠**物件引用**反查到對應的 GraphNode。
如果同一個物件被多個 component 共用，單一 WeakMap 無法區分「是哪個 component 的節點」。

這個限制導致 ref/reactive/computed、props、inject 三種資料各需要不同的追蹤策略。

---

## 三種資料的追蹤策略

### 1. setupState（ref / reactive / computed）

每個 component instance 自己建立的 ref/reactive/computed，物件引用天生唯一。

- `valNodeMap: WeakMap<rawObject, GraphNode>`
- `event.target` 直接命中，沒有衝突問題

---

### 2. Props

**問題一：值被 unwrap，無法當 WeakMap key**

Vue 傳遞 props 時，如果值是 ref，子層拿到的是 unwrapped 後的 primitive（`number`、`string`）。
Primitive 無法當 WeakMap key，所以不能用值本身來反查節點。

**解法：用 `rawPropsObj` 當容器 key**

Vue 為每個 component instance 建立唯一的 raw props 物件（`instance.props.__v_raw`）。
`onTrack` 觸發時 `event.target = rawPropsObj`，這是 per-instance 唯一的容器。

```
propKeyNodeMap: WeakMap<rawPropsObj, Map<propName, GraphNode>>
```

用容器當外層 key，propName 當內層 key，scope 天然隔離。

---

**問題二：找不到父層來源（prop 重新命名）**

父層可能用不同名稱傳 prop，例如父層有 `count`，傳給子層的 prop 叫 `value`。
Strategy 1（同名查找）無法處理這種情況。

**Strategy 1：同名查找**

prop 名稱與父層 setupState key 相同時，直接從 `parentRawSetupState[propKey]` 查
`injectRawToNodeMap` 或 `valNodeMap`。

**Strategy 2：sentinel dry-run（不同名 prop）**

1. 建立 `sentinelProxy`，讓 setupState 每個 key 的存取回傳唯一 Symbol
2. 建立 `propsSentinelProxy`，讓 `$props` 每個 key 的存取回傳唯一 Symbol（以 `$prop:` 為前綴存入同一張 `sentinelToKey` map）
3. 暫時替換 `instance.setupState = sentinelProxy`，呼叫 `render()` 做 dry-run
4. `traverseVNodeForSentinels` 掃 VNode tree，找子元件 props 中值為 Symbol 的項目
5. 建立對應表：`childComponentType → propName → parentKey`，存入 `instanceChildPropKeyMap`
6. dry-run 結束後立刻還原 `instance.setupState`

Strategy 2 查找時依前綴決定來源：
- 無前綴 → 父層 setupState，走 `injectRawToNodeMap` 或 `valNodeMap`
- `$prop:` 前綴 → 父層 props，走 `propKeyNodeMap`

**sentinel dry-run 的觸發原理**

render 函數透過兩條路存取 setupState：
- `$setup.xxx`（render 函數第 4 個參數直接是 `sentinelProxy`）
- `_ctx.xxx`（Vue component proxy 內部查找時讀 `instance.setupState`，已被替換為 `sentinelProxy`）

兩條路都會命中 sentinel proxy 的 `get` trap，回傳 Symbol。

---

### 3. Inject

**根本限制：shared reference**

`inject()` 不複製值，回傳的是與 `provide()` 完全相同的 RefImpl 引用。

```
A.num (RefImpl)
  ├─ B inject → 同一個 RefImpl
  └─ C inject → 同一個 RefImpl
```

`event.target` 完全相同，無法用 `valNodeMap` 區分「這次 onTrack 在哪個 component」。
若覆寫 `valNodeMap`，最後一個執行 inject override 的 component 會污染所有後續查找，
導致第三、四層 component 的 props 連結到錯誤的節點。

**解法：key 用共用引用，value 存自己的節點**

- **Phase 1：`injectRawToNodeMap`（module-level WeakMap）**
  - key：父層 RefImpl（共用引用，不修改）
  - value：子層自己建立的 inject node（per-component）
  - 深度優先遍歷保證父層先寫，子層 prop 連結時查得到
  - 刻意不寫入 `valNodeMap`，避免兄弟 component 互蓋

- **Phase 2：`injectRawToLocalNode`（per-component local Map）**
  - 每次 `triggerInstance` 重建，只包含當前 component 的 inject nodes
  - `resolveDepNode` 優先查這個 Map，命中即返回正確節點
  - 不跨 component 共享，無污染問題

**`resolveDepNode` 查找順序**

```
injectRawToLocalNode.get(target)          // inject（per-component，優先）
  ?? valNodeMap.get(target)               // ref / reactive / computed
  ?? valNodeMap.get(rawSetupState[depName]) // Pinia store fallback
  ?? propKeyNodeMap.get(target)?.get(key) // props（target 是 rawPropsObj）
```

---

## 深度優先順序的重要性

Phase 1（`collectInstance`）採深度優先遍歷：父層先執行，子層後執行。

這保證了：
- 父層的 `injectRawToNodeMap` 在子層處理 prop 連結之前已經寫入
- Strategy 1 / Strategy 2 查找父層節點時，父層節點必然已存在
- `instanceChildPropKeyMap`（sentinel dry-run 結果）在子層處理之前已由父層建立

若改為廣度優先或其他順序，上述查找會失敗。

---

## 4. Pinia storeToRefs

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

### ref / reactive（ObjectRefImpl）

`storeToRefs` 將 state 包成 ObjectRefImpl，getter = `() => store[key]`，沒有自己的 dep。

**追蹤行為**：`data1` 讀 `count.value` 時，getter 執行，Vue 為 `data1` 產生兩次 onTrack：

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

### computed（wrapper ComputedRefImpl）

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

### 共用解法：isPiniaStoreProxy guard

storeToRefs wrapper 執行時都可能產生 target = storeProxy 的 onTrack，且都不應建立 dep。在 `bindSetupTrack` onTrack 最前面統一攔截：

```ts
if (isPiniaStoreProxy(event.target as object)) return;
```

> **備註**：storeProxy 作為 onTrack target 只在存取 storeToRefs wrapper 時出現。正常的 computed/watch 追蹤 store 資料時，target 是底層的 RefImpl 或 ComputedRefImpl，不會是 storeProxy，因此這個 guard 不影響其他情境。

---

## 已知限制

- **sentinel dry-run 失敗**：部分 component 的 render 函數在 dry-run 時回傳非 VNode（如 Symbol），導致 `traverseVNodeForSentinels` 直接 return，Strategy 2 對該 component 失效，只能靠 Strategy 1 補救。
- **Prop → prop 的 sentinel**：只有 `$props.xxx` 的存取路徑能被 `propsSentinelProxy` 攔截，若 render 函數透過 `_ctx.xxx` 存取 prop（不同編譯模式），sentinel 無法捕捉。
