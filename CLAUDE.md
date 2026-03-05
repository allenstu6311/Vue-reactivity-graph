## 專案簡介

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

詳細型別定義見 `src/types/graph.ts`。

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

## 禁止事項

- 不要動UI.html
- 除非有我同意，不然不直接修改代碼