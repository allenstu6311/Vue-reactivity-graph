# Test Plan — Vue Reactivity Graph

## 總體策略

- **Integration test 優先**：透過最終 graph 結果驗證行為，而非測試內部實作
- `collectInstance` / `triggerInstance` 不做單元測試，由 integration test 涵蓋
- Helper / util 函數在重構時視需要補充單元測試
- 舊的 `tracker.test.ts` 預計刪除

## 執行模型（理解基礎）

walker 分兩個 phase：
1. **collectInstance**：遍歷 component tree，建出所有節點，存進 graph，不觸發任何訂閱
2. **triggerInstance**：對每個 computed 掛 `onTrack` 並強制重算，對每個 watch effect 呼叫 `effect.run()`，填入 deps / subs

deps / subs 的值有兩種格式：
- **同元件內**：用 `varName`（如 `"count"`、`"double"`、`"w_0"`）
- **跨元件**（prop / inject）：用完整 `id`（如 `"ParentComp.count"`、`"ParentComp.ChildComp.value"`）

---

## Phase 1 — 單一元件基礎驗證

> 目標：單一元件內 ref / reactive / computed / watch 節點建立正確，deps / subs 連線正確

**測試檔案**：`src/injected/__tests__/basic.test.ts`

**測試 app**：

```ts
// component name: "TestComp"
const count   = ref(0)
const items   = reactive({ count: 0 })               // 單層屬性，避免巢狀 reactive 追蹤雜訊
const double  = computed(() => count.value * 2)      // 讀 ref
const label   = computed(() => `${double.value} items`)  // 讀 computed（chain）
const listLen = computed(() => items.count)          // 讀 reactive（單層屬性存取）
watch(count, () => {})                               // w_0：監聽 ref
watch(double, () => {})                              // w_1：監聽 computed
```

> 注意：使用 `items.list.length` 這類巢狀存取會讓 `listLen.deps` 額外出現 `"length"`（reactive 陣列的 length 屬性也被追蹤），因此改用單層屬性 `items.count` 保持斷言簡潔。

**驗收標準（expected graph）**：

```js
{
  TestComp: [
    { id: "TestComp.count",   varName: "count",   type: "ref",      deps: [],          subs: ["double", "w_0"] },
    { id: "TestComp.items",   varName: "items",   type: "reactive", deps: [],          subs: ["listLen"] },
    { id: "TestComp.double",  varName: "double",  type: "computed", deps: ["count"],   subs: ["label", "w_1"] },
    { id: "TestComp.label",   varName: "label",   type: "computed", deps: ["double"],  subs: [] },
    { id: "TestComp.listLen", varName: "listLen", type: "computed", deps: ["items"],   subs: [] },
    { id: "TestComp.w_0",     varName: "w_0",     type: "watch",    deps: ["count"],   subs: [] },
    { id: "TestComp.w_1",     varName: "w_1",     type: "watch",    deps: ["double"],  subs: [] },
  ]
}
```

> subs 順序：computed 的 onTrack 在 watch effect.run() 之前執行，所以 double / w_0 的順序固定

**額外測試情境**：

| 情境 | 做法 | 驗收 |
|---|---|---|
| 不重複紀錄 | 加一個 `computed(() => count.value + count.value)` | count.subs 裡該 computed name 只出現一次 |
| 無訂閱者的 ref | 加一個 `const unused = ref(0)` 且沒有任何 computed/watch 讀它 | unused.subs = [] |

---

## Phase 2 — Pinia Store 追蹤

> 目標：store state 能被 computed / watch 正確追蹤為依賴
> 狀態：待規劃，會新增更多複雜案例

---

## Phase 3 — Props 基礎傳遞

> 目標：子元件 prop 節點能正確連回父層的 source node
> 範圍：單層 props 傳遞，不涉及 props 再傳 props

**測試 app**：

```
ParentComp
  ├── ref: price
  ├── computed: discounted  (讀 price)
  ├── <ChildComp :a="price" :b="discounted" />   → graph key: "ParentComp.ChildComp"
  └── <ChildComp :a="price" :b="discounted" />   → graph key: "ParentComp.ChildComp_1"
```

**驗收標準（expected graph，只列關鍵欄位）**：

```js
{
  "ParentComp": [
    { id: "ParentComp.price",      type: "ref",      deps: [],          subs: ["discounted", "ParentComp.ChildComp.a", "ParentComp.ChildComp_1.a"] },
    { id: "ParentComp.discounted", type: "computed", deps: ["price"],   subs: ["ParentComp.ChildComp.b", "ParentComp.ChildComp_1.b"] },
  ],
  "ParentComp.ChildComp": [
    { id: "ParentComp.ChildComp.a", type: "prop", deps: ["ParentComp.price"],      subs: [] },
    { id: "ParentComp.ChildComp.b", type: "prop", deps: ["ParentComp.discounted"], subs: [] },
  ],
  "ParentComp.ChildComp_1": [
    { id: "ParentComp.ChildComp_1.a", type: "prop", deps: ["ParentComp.price"],      subs: [] },
    { id: "ParentComp.ChildComp_1.b", type: "prop", deps: ["ParentComp.discounted"], subs: [] },
  ],
}
```

---

## Phase 4 — Provide / Inject

> 目標：inject 節點能正確連回父層 provide 來源

**測試 app**：

```
ParentComp
  ├── ref: count
  ├── provide('countKey', count)
  ├── <ChildComp />   → graph key: "ParentComp.ChildComp"
  │     ├── inject: injectedCount  (inject('countKey'))
  │     └── computed: double  (讀 injectedCount)
  └── <ChildComp />   → graph key: "ParentComp.ChildComp_1"
        └── inject: injectedCount  (inject('countKey'))
```

**驗收標準（expected graph，只列關鍵欄位）**：

```js
{
  "ParentComp": [
    { id: "ParentComp.count", type: "ref", deps: [], subs: ["ParentComp.ChildComp.injectedCount", "ParentComp.ChildComp_1.injectedCount"] },
  ],
  "ParentComp.ChildComp": [
    { id: "ParentComp.ChildComp.injectedCount", type: "inject", deps: ["ParentComp.count"], subs: ["ParentComp.ChildComp.double"] },
    { id: "ParentComp.ChildComp.double",        type: "computed", deps: ["injectedCount"],  subs: [] },
  ],
  "ParentComp.ChildComp_1": [
    { id: "ParentComp.ChildComp_1.injectedCount", type: "inject", deps: ["ParentComp.count"], subs: [] },
  ],
}
```

> inject.subs 用完整 id（`"ParentComp.ChildComp.double"`），因為 depNode.type = "inject" 走完整 id 路徑

---

## Phase 5 — 極端情境

> 目標：複雜的跨層傳遞下仍能正確連線
> 狀態：待規劃，驗收標準待補

| 情境 |
|---|
| props 再傳 props（grandparent → parent → child） |
| inject 值當 prop 傳入子元件 |

---

## 測試環境注意事項

**測試元件必須從 `@vue/runtime-core` 匯入**（`ref` / `reactive` / `computed` / `watch` / `h` / `defineComponent`），不得從 `'vue'` 匯入。

**原因**：`test-utils.ts` 使用 `createRenderer` 建立 null renderer，其內部的 `currentInstance` 狀態與 `@vue/runtime-core` 共用同一個 module instance。若測試元件從 `'vue'`（`@vue/runtime-dom`）匯入 `watch`，由於 Node.js ESM 會載入兩個不同的 module instance，`watch` 就看不到 renderer 設定的 `currentInstance`，導致 watch effect 不被加入 `instance.scope.effects`，walker 因而無法偵測到 watch 節點。

---

## 資料夾結構

```
src/injected/__tests__/
  test-utils.ts       ← 共用 helper：建 Vue app、執行 walker 完整流程、回傳 graph
  basic.test.ts       ← Phase 1：單一元件基礎驗證
  props.test.ts       ← Phase 3：Props 基礎傳遞
  inject.test.ts      ← Phase 4：Provide / Inject
  edge-cases.test.ts  ← Phase 5：極端情境
  tracker.test.ts     ← 待刪除
```

---

## 待決策

- [ ] 重構後是否補 `traverseVNodeForSentinels` / `resolveGlobalComponent` 的單元測試？
