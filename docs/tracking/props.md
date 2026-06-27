# Tracking: Props

> 目標：追蹤每個子元件的 prop「來自父層的哪個變數」，畫出 `父層來源 → 子層 prop` 的依賴。
> 機制：**dry-run（試跑 render）+ value-backed navigating sentinel**。

---

## 問題一：值被 unwrap，無法當 WeakMap key

Vue 傳遞 props 時，若值是 ref，子層拿到的是 unwrapped 後的 primitive（`number`、`string`）。
Primitive 無法當 WeakMap key，所以不能用值本身來反查節點。

**解法：用 `rawPropsObj` 當容器 key**

Vue 為每個 component instance 建立唯一的 raw props 物件（`instance.props.__v_raw`）。
`onTrack` 觸發時 `event.target = rawPropsObj`，這是 per-instance 唯一的容器。

```
propKeyNodeMap: WeakMap<rawPropsObj, Map<propName, GraphNode>>
```

用容器當外層 key、propName 當內層 key，scope 天然隔離。此設計沿用至今。

---

## 問題二：父層用不同名稱傳 prop / 多層存取 / 整包 v-bind

父層可能：
- 用不同名稱傳（父 `count` → 子 prop `value`）
- 傳巢狀存取結果（`:test="obj.a.b"`）
- 整包展開（`<Child v-bind="someObj" />`）

這些都無法用「同名比對」解決，需要實際試跑 render、觀察資料怎麼流進子元件。

### 解法：navigating sentinel + dry-run

#### 1. sentinel 是什麼

`createSentinel(chain, rootKey)`（`collect/sentinel.ts`）建立一個 **callable Proxy**，當作「追蹤標記」：

- `chain`：從根走到目前，沿路經過的**真實值**清單（如 `[objProxy, {b:20}, 20]`）。
- `rootKey`：最初從哪個 key 出發（setup key 名，或 props 轉傳時的 `props.xxx`）。
- **get trap**：往下導航——讀 `tip` 的某個 key，把取到的真實值接進 chain，回傳新 sentinel，支援 `a.b.c` 多層存取。
- **apply trap**：被當函式呼叫（如模板 `t(...)`）時回傳空 chain 的 sentinel——不 crash，且函式回傳值不誤連回原變數。
- 防偽裝：所有 `__v_*` 鍵、`__isSuspense`/`__isTeleport` 回 `undefined`（否則 Vue 的 `guardReactiveProps`/`createVNode` 會把 sentinel 當 reactive props 處理，破壞 Branch A）；`Symbol.toPrimitive` 回 `""`（被字串化時不爆）；讀 ref/computed 的 `.value` 回自己（不觸發 getter）。

每個 sentinel 連同它的 `{ chain, rootKey }` 存進 module 級的 `sentinelRegistry`（WeakMap），供 `isSentinel()` 認身分、取回來源鏈。

> **崩潰免疫**：sentinel 可讀（回 sentinel）、可呼叫（apply）、可字串化（`""`），任何存取都不丟錯。
> 舊版 sentinel 是 Symbol，模板若有 `t(...)` 之類的呼叫會 `TypeError`，導致整個父層 dry-run 中斷、所有 prop 來源全失蹤；navigating sentinel 順帶解掉此 crash。

#### 2. dry-run 流程

`runSentinelDryRun`（`collect/sentinel.ts`）：

1. 建 `sentinelSetupProxy` 替換 `instance.setupState`：讀任一 key → 回 `createSentinel([rawSetupState[key]], key)`。
2. 建 `sentinelPropsProxy` 替換 `instance.props`：讀任一 prop → 回 `createSentinel([target[key]], 'props.' + key)`。
   （讀 `target[key]`，即建 proxy 時捕獲的原始 props，不可讀已被換掉的 `instance.props`，否則無限遞迴。）
3. 暫時替換、呼叫 `render()` 做 dry-run，`try/finally` 確保**一定還原** `setupState`/`props`（破壞 finally 會讓 Vue 響應式永久錯亂）。
4. `traverseVNodeForSentinels` 掃 dry-run 產出的 VNode 樹，撈出「子元件 prop ← 來源」。

> **執行時機**：dry-run 必須排在 `collectInject` + `collectSetup` **之後**（`walker.ts` 的 `collectInstance`），
> 因為 `resolveChain` 要查 `valNodeMap` / `propSourceInjectMap`，這兩張表得先由那兩個 collector 填好。

#### 3. 掃 VNode 樹：`traverseVNodeForSentinels`

對每個有 `type` 與 `props` 的 vnode：

- **還原子組件身分**（`resolvedComponent`）：`vnode.type` 可能是 sentinel（`<component :is>` 來自 setup）、字串（全域元件如 `el-table`，需從 `appContext` 查回物件）或已是物件，統一還原成 component 物件，才能與子層 `instance.type` 對應。
- **Branch A — `isSentinel(vnode.props)`**：`<Child v-bind="someObj" />`，整包 props 是單一 sentinel，不能 `Object.entries`。把 sentinel 背後物件讀出來（此處刻意 `unref` 一次才有 key 可列舉），逐 `innerKey` 用 `resolveChain([innerVal], "")` 反查來源。
- **Branch B — 一般情形**：`<Child :count="count" />`，逐一檢查每個 prop 值是否為 sentinel，是則 `resolveChain(chain, rootKey)`。

`resolveChain(chain, rootKey)` 從 chain **尾到根**掃，對每個物件層 `getRaw` 後查 `propSourceInjectMap ?? valNodeMap`，第一個命中的節點即來源。找到 → 存 `node.id`；找不到 → 存 `rootKey`（留給 collectProps 後手，見下）。

#### 4. 結果結構：`instanceChildPropKeyMap`

dry-run 結果寫進：

```
instanceChildPropKeyMap: WeakMap<父instance, dryRunChildPropMap>
  dryRunChildPropMap:     Map<子組件物件, { maps: Map<propName, 來源>[]; nextIndex }>
```

- 外層 key 是子組件物件，回答「哪一種子組件」。
- `maps[]` + `nextIndex`：同型子組件並排出現（`<Child/><Child/>`）時，各實例疊一張 propMap，靠 `nextIndex` 游標對位（消費端見下）。
- 最內層 `Map<propName, 來源>`：來源是 `node.id`（resolveChain 命中）或 `rootKey`（未命中）。

---

## 子層消費：`collectProps`

`collect/props.ts` 走到真正的子元件實例時：

1. 建本層每個 prop 節點，掛進 `propNodeMap`（→ `propKeyNodeMap`）、`nodes[]`、`nodeIdMap`。
2. 從父層的 `instanceChildPropKeyMap` 取出本型子組件的 `siblingPropMaps`，用 `nextIndex` 領到本實例那張 `maps[instanceOrdinal]`，查得 `sourceKey`。
3. 依 `sourceKey` 連結父層節點：
   - **主路徑**：`sourceKey` 是 node.id → `ctx.nodeIdMap.get(sourceKey)` 直接拿到父層節點。
   - **props 轉傳分支**：`sourceKey` 以 `props.` 開頭（父層把自己的 prop 再往下傳，如 `<Child :value="this.count" />` 而 `count` 是父層的 prop）→ 切掉前綴，查父層 **`propKeyNodeMap`** 的 prop 節點。
     （prop 傳下來是 unwrap 後的 primitive，在 `valNodeMap` 無 identity，resolveChain 必然失敗，故走 rootKey `props.xxx` 由此分支接住——這是 prop→prop 轉傳的唯一機制。）

> **已停用（保留註解未刪）**：舊式「同名反查」後備——`sourceKey` 為純名字時，用 `parentRawSetupState[sourceKey]` 查 `valNodeMap`。
> 在現行順序下 resolveChain 對所有 setup 來源都會成功並存 node.id，此後備永不命中（實測停用後測試全綠），屬防禦性殘留。

---

## 已知瓶頸

- **`v-bind="someObj"` 巢狀結構**：Branch A 只處理一層展開，若 `someObj` 的 value 是另一個 reactive 物件，不遞迴追蹤。
- **多個 `v-bind` 展開**：`<Child v-bind="a" v-bind="b" />` 時 Vue 以 `mergeProps` 合併，`vnode.props` 是合併後的一般物件而非單一 sentinel，Branch A 不觸發，改由 Branch B 逐 key 處理（各 key 的值仍是 sentinel）。
