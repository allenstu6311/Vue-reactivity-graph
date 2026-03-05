## 專案簡介

本專案是一個瀏覽器 DevTools 插件，專為 Vue 3 開發環境設計。
透過讀取 Vue 3 的響應式系統內部狀態，視覺化呈現 `ref` / `reactive` 與 `computed` / `watch` 之間的依賴關係，幫助開發者快速理解與 debug 響應式資料流。

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

- 框架：Vue 3 + Vite
- 狀態管理：Pinia
- 樣式：TailwindCSS / SCSS
- 套件管理：npm / pnpm
- 平台：Browser Extension（DevTools Panel）

## 禁止事項
不要動UI.html