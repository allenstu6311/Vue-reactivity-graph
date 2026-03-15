## 專案簡介

**插件名稱**：Vue Reactivity Graph

本專案是一個瀏覽器 DevTools 插件，專為 Vue 3 開發環境設計。
透過讀取 Vue 3 (v3.5.24)的響應式系統內部狀態，視覺化呈現 `ref` / `reactive` 與 `computed` / `watch` 之間的依賴關係，幫助開發者快速理解與 debug 響應式資料流。

**目標使用者**：Vue 3 前端開發者（僅限 dev mode）
**核心功能**：
- 查看每個 `ref` / `reactive`（Dep）被哪些 `computed` / `watch`（Subscriber）訂閱
- 查看每個 `computed` / `watch` 依賴了哪些 `ref` / `reactive`
- 顯示每個變數所屬的來源檔案（如 `CartPanel.vue`、`useCart.js`）
- 不修改應用程式邏輯，只讀取 / 記錄

**硬限制**：
- 只支援 Vue 3，不支援 Vue 2
- 只在 dev mode 下運作

---

## 技術棧

- 框架：Vue 3 + Vite + TypeScript
- 套件管理：pnpm
- 平台：Browser Extension（DevTools Panel）

## 圖表資料結構

詳細型別定義見 `src/graph/types.ts`。

每個節點（`GraphNode`）：
- `id`：`${componentName}.${varName}`，全域唯一
- `type`：`ref` | `reactive` | `computed` | `watch`
- `val`：當前值（字串表示）
- `file`：來源檔案（如 `CartPanel.vue`）
- `deps`：依賴的變數名稱陣列（computed / watch 有）
- `subs`：被訂閱的變數名稱陣列（ref / reactive / computed 有）

整體結構為 `ComponentGraph = Record<string, GraphNode[]>`，key 為 component 名稱。

``
const COMPS = {
  cart: [
    { id: 'cart.price',        type: 'ref',      val: '99',           file: 'CartPanel.vue', subs: ['total', 'discounted'] },
    { id: 'cart.qty',          type: 'ref',      val: '3',            file: 'CartPanel.vue', subs: ['total', 'itemLabel'] },
    { id: 'cart.coupon',       type: 'ref',      val: '"SAVE10"',     file: 'CartPanel.vue', subs: ['discounted'] },
    { id: 'cart.cart',         type: 'reactive', val: '{items,note}', file: 'CartPanel.vue', subs: ['itemLabel', 'isEmpty', 'w_cart_total'] },
    { id: 'cart.total',        type: 'computed', val: '297',          file: 'CartPanel.vue', deps: ['price', 'qty'],        subs: ['w_cart_total'] },
    { id: 'cart.discounted',   type: 'computed', val: '267',          file: 'CartPanel.vue', deps: ['price', 'coupon'] },
    { id: 'cart.itemLabel',    type: 'computed', val: '"3 items"',    file: 'CartPanel.vue', deps: ['qty', 'cart'] },
    { id: 'cart.isEmpty',      type: 'computed', val: 'false',        file: 'useCart.js',    deps: ['cart'] },
    { id: 'cart.w_cart_total', type: 'watch',    val: '—',            file: 'CartPanel.vue', deps: ['cart', 'total'] },
  ],
}
``

---

## 檔案地圖

| 檔案 | 職責 |
|---|---|
| `injected/index.ts` | 入口：取 `__vue_app__._instance`，掛 HMR hook，呼叫 walker |
| `injected/walker.ts` | 核心：遍歷 component instance tree，sentinel dry-run 追蹤 prop 來源，建立 GraphNode[] |
| `injected/tracker.ts` | 識別 ref/reactive/computed/watch，標記 `__vrg_depKey`，建 valNodeMap |
| `graph/types.ts` | 純型別：NodeType, GraphNode, ComponentGraph |
| `graph/index.ts` | graph 全域狀態 + getGraph / updateGraph / notifyUpdate |
| `types/vue-internals.d.ts` | Vue 未公開內部型別（ComputedRefImpl, ExtendedComponentInstance 等） |
| `content/index.ts` | 注入 injected.js 到頁面，轉發 postMessage 給 background |
| `background/index.ts` | 管理 devtools port，廣播 VUE_GRAPH_UPDATE |
| `devtools/index.ts` | 建立 DevTools panel（panel.html） |
| `panel/App.vue` | 根元件：接收更新，管理選取狀態 |
| `panel/composables/useLayout.ts` | dagre 佈局 + upstream/downstream BFS 展開 |
| `panel/components/GraphView.vue` | vue-flow 渲染節點與邊 |
| `panel/components/GraphNode.vue` | 單一節點外觀 |
| `panel/components/VariableList.vue` | 左側變數清單 |
| `panel/nodeTypeMeta.ts` | 各節點類型的顏色、標籤設定 |

---

## 整體資料流

```
Vue App（頁面）
  └─ injected/index.ts        取 _instance → 呼叫 walker/tracker → 結果存 window.__vueReactivityGraph
       ↓ window.postMessage('VUE_GRAPH_UPDATE')
  content/index.ts            轉發給 background
       ↓ chrome.runtime.sendMessage
  background/index.ts         廣播給所有已連線的 panel
       ↓ port.postMessage
  panel/App.vue               接收更新，傳資料給子元件
    ├─ composables/useLayout.ts    dagre 佈局 + upstream/downstream BFS
    ├─ components/GraphView.vue    vue-flow 渲染節點與邊
    ├─ components/GraphNode.vue    單一節點外觀
    └─ components/VariableList.vue 左側變數清單
```

---

## 命名慣例

- `__vrg_` 前綴為本插件（Vue Reactivity Graph）專用，直接掛在 Vue 響應式物件上的屬性都使用此前綴
- 避免與 Vue 內部的 `__v_` 前綴衝突

---

## 啟動指令

請在每次對話開始時讀取 `ARCHITECTURE.md`。

---

## 禁止事項

- 不要動UI.html
- 除非有我同意，不然不直接修改代碼