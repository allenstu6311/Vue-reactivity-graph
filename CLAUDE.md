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

**開源目標**：
本專案計畫公開開源。所有設計決策、型別使用、API 設計都必須考慮外部使用者的可讀性與可維護性，而不只是「目前沒有 bug」。
- 避免 monkey-patching Vue 響應式物件（除非有充分理由）
- 型別設計要讓貢獻者能快速理解意圖
- 侵入性操作（如直接掛屬性在 Vue 物件上）需有明確說明或替換成更乾淨的方案

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

---

## 檔案地圖

| 檔案 | 職責 |
|---|---|
| `injected/index.ts` | 入口：取 `__vue_app__._instance`，掛 HMR hook，呼叫 walker |
| `injected/walker.ts` | 核心：遍歷 component instance tree，sentinel dry-run 追蹤 prop 來源，建立 GraphNode[] |
| `injected/tracker.ts` | 識別 ref/reactive/computed/watch，建 valNodeMap；resolveDepName / resolveDepNode |
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

## 命名慣例

- 本插件不再對 Vue 響應式物件進行 monkey-patching（已移除 `__vrg_depKey`）
- 若未來需要在 Vue 物件上掛屬性，仍使用 `__vrg_` 前綴，避免與 Vue 內部 `__v_` 前綴衝突

---

## 啟動指令

請在每次對話開始時讀取 `ARCHITECTURE.md`與 `DESIGN_NOTES.md`。

---

## Guardrails

- 資訊不足時必須提問
- 除非有我同意，不然不直接修改代碼
- 不可假設未提供的資訊
- 不可跳過分析直接給最終答案
- **Feature / Refactor 任務**：動手前必須確認根目錄存在完整的 `spec.md`，且使用者已逐步確認每個步驟後才能執行；不得跳步或一次送出所有變更

## Agent 使用規則

所有開發需求（Feature / Bugfix / Refactor）走以下固定流程，不得跳步：

**Step 1 — 需求分析**
收到任何需求，立刻呼叫 `spec-writer`，產出 `spec.md`。

**Step 2 — 領域審閱**
`spec-writer` 完成後，根據 spec.md 末尾的「審閱建議」呼叫對應的 Vue 領域代理人，審閱並補充實作細節：
- props / sentinel dry-run / `propKeyNodeMap` → `vue-props-expert`
- `valNodeMap` / `collectSetupState` / ref/reactive/computed 識別 → `vue-setup-state-expert`
- `injectRawToNodeMap` / `resolveDepNode` inject 路徑 / provide/inject 追蹤 → `vue-inject-expert`
- `storeToRefs` / Pinia store 追蹤 / dep 結構 → `vue-pinia-expert`
- 任務橫跨多個領域時，依上列順序逐一呼叫

**Step 3 — 使用者確認**
等使用者明確說「可以開始了」（或同等意思），才進入下一步。

**Step 4 — 實作**
呼叫 `developer`，按已確認的 spec.md 執行程式碼修改。

**Step 5 — 補測試（視情況）**
`developer` 完成後，由 `developer` 自行判斷是否呼叫 `test-writer`。

