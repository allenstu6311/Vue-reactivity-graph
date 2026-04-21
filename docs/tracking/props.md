# Tracking: Props

## 問題一：值被 unwrap，無法當 WeakMap key

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

## 問題二：找不到父層來源（prop 重新命名）

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

## Strategy 3：v-bind 整包展開（Branch A）

當模板寫 `<HomeView v-bind="someObj" />` 時，Vue compiler 直接把 `_ctx.someObj` 當成整個 `props` 傳入，dry-run 後 `vnode.props` 本身就是一個 sentinel Symbol（`Symbol(someObj)`），無法 `Object.entries`，Strategy 1 / Strategy 2 均失效。

**解法：rawSetupState 反查表**

1. 偵測到 `typeof vnode.props === 'symbol' && sentinelToKey.has(vnode.props)` → `sourceKey = 'someObj'`
2. 建立反查表：遍歷 `rawSetupState`（排除 `sourceKey` 自身），`value → varName`
3. `rawSourceObj = sourceVal.__v_raw ?? sourceVal`（繞過 reactive proxy 取底層 plain object）
4. 對每個 `innerKey`：`reverseMap.get(rawSourceObj[innerKey])` 取得 `sourceVarName`
5. `propMap.set(innerKey, sourceVarName)`（格式與 Strategy 2 相同，子層解析邏輯零修改）

**關鍵前提**：`toRaw(reactive({ text: num })).text === num`（RefImpl 本身），`rawSetupState` 也直接儲存 RefImpl，兩者是同一個物件引用，反查可命中。

找不到來源時 `console.warn` 並靜默跳過（例如 `someObj` 內含 primitive value）。

---

## 已知瓶頸

- **Prop → prop 的 sentinel**：只有 `$props.xxx` 的存取路徑能被 `propsSentinelProxy` 攔截，若 render 函數透過 `_ctx.xxx` 存取 prop（不同編譯模式），sentinel 無法捕捉。
- **`v-bind="someObj"` 巢狀結構**：Strategy 3 只處理一層展開，若 `someObj` 的 value 是另一個 reactive 物件，不遞迴追蹤。
- **多個 `v-bind` 展開**：`<Child v-bind="a" v-bind="b" />` 時 Vue 以 `mergeProps` 合併，`vnode.props` 是合併後物件而非 Symbol，Strategy 3 不觸發，改由 Strategy 2 處理（各 key 的值仍是 sentinel Symbol）。
