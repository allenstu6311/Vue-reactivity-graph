# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## 指令

```bash
pnpm dev          # 監聽模式建置（watch），開發時使用
pnpm build        # 一次性建置輸出到 dist/
pnpm typecheck    # vue-tsc 型別檢查（不輸出）
pnpm test         # 執行所有單元測試（vitest run）
```

測試檔位置：`src/injected/__tests__/*.test.ts`

執行單一測試檔：
```bash
pnpm vitest run src/injected/__tests__/props.test.ts
```

載入插件：瀏覽器開啟 `chrome://extensions/`，以「載入未封裝擴充功能」指向 `dist/` 資料夾。

---

## 技術棧

- 框架：Vue 3 + Vite + TypeScript
- 套件管理：pnpm
- 平台：Browser Extension（DevTools Panel）

## 圖表資料結構

詳細型別定義見 `src/graph/types.ts`。

每個節點（`GraphNode`）：
- `id`：`${uid}.${varName}`，全域唯一（uid 為 Vue component instance 的內部 uid）
- `type`：`ref` | `reactive` | `computed` | `watch` | `component`（sentinel）
- `val`：當前值（字串表示）
- `file`：來源檔案（如 `CartPanel.vue`）
- `uid`：所屬 component 的 Vue uid（sentinel node 專用欄位）
- `parentUid`：父層 component 的 Vue uid（sentinel node 專用欄位）
- `name`：component 名稱（sentinel node 專用欄位）
- `path`：component 路徑，同名元件加 `_N` 後綴（sentinel node 專用欄位）
- `deps`：依賴節點的完整 id（`uid.varName` 格式），computed / watch 有
- `subs`：訂閱者節點的完整 id（`uid.varName` 格式），ref / reactive / computed 有

整體結構為 `GraphData.components: Record<string, GraphNode[]>`，key 為 uid string。每個 component 的 `nodes[0]` 為 `type: 'component'` 的 sentinel node，記錄 uid / parentUid / name / path 元資料，ComponentTree 據此重建樹形結構。

---

## 檔案地圖

| 檔案 | 職責 |
|---|---|
| `injected/index.ts` | 入口：取 `__vue_app__._instance`，掛 HMR hook，呼叫 walker |
| `injected/hmr.ts` | HMR 攔截與轉交：patchHmrRuntime、setupHmrHook；不持有 ctx，不直接呼叫 runScan |
| `injected/walker.ts` | 核心：traverseVNode（DFS 遍歷）、runScan（封裝完整掃描流程）、collectInstance、triggerInstance |
| `injected/context/WalkContext.ts` | WalkContext class：六個 walker-scoped map、`resolveComponentKey`、`resolveInstance`、`reset`；`extractInstanceData` 函數 |
| `injected/context/types.ts` | `InstanceData` 介面 |
| `injected/helper/nodes.ts` | `buildNode`、`setValNode`：GraphNode 建立與寫入 valNodeMap |
| `injected/helper/resolve.ts` | `resolveDepName`、`resolveDepNode`、`isPiniaStoreProxy`、`isStoreToRefsRef` |
| `injected/helper/types.ts` | 各函數參數介面：`CollectSetupStateParams`、`ResolveDepNodeParams`、`BindSetupTrackParams`、`BaseCollectParams` |
| `injected/collect/types.ts` | collect 子模組的參數介面：`CollectPropsParams`、`CollectInjectParams`、`CollectSetupParams`、`CollectWatchParams`、`SentinelDryRunParams` |
| `injected/collect/sentinel.ts` | `runSentinelDryRun`：sentinel dry-run 邏輯；`traverseVNodeForSentinels`、`resolveGlobalComponent` helper |
| `injected/collect/props.ts` | `collectProps`：prop 節點建立與 Strategy 1/2 來源連結 |
| `injected/collect/inject.ts` | `collectInject`：inject 偵測與 inject node 建立（回傳 injectKeySet） |
| `injected/collect/setup.ts` | `collectSetup`、`collectPiniaState`：搬自 tracker.ts，Phase 1 節點蒐集 |
| `injected/collect/watch.ts` | `collectWatch`：watch 節點建立 |
| `injected/subscribers/types.ts` | `TriggerContext`、`BindComputedTrackParams`、`BindWatchTrackParams` 介面 |
| `injected/subscribers/shared.ts` | `linkNodes`、`createOnTrackHandler` |
| `injected/subscribers/computed.ts` | `bindComputedTrack`（Phase 2 computed onTrack 綁定） |
| `injected/subscribers/watch.ts` | `bindWatchTrack`（Phase 2 watch onTrack 綁定） |
| `graph/types.ts` | 純型別：NodeType, GraphNode, ComponentGraph |
| `graph/index.ts` | graph 全域狀態 + getGraph / updateGraph / notifyUpdate |
| `types/vue-internals.d.ts` | Vue 未公開內部型別（ComputedRefImpl, ExtendedComponentInstance 等） |
| `content/index.ts` | 注入 injected.js 到頁面，轉發 postMessage 給 background |
| `background/index.ts` | 管理 devtools port，廣播 VUE_GRAPH_UPDATE |
| `devtools/index.ts` | 建立 DevTools panel（panel.html） |
| `panel/App.vue` | 根元件：接收更新，管理選取狀態 |
| `panel/composables/useGraphFetcher.ts` | 封裝 `chrome.devtools.inspectedWindow.eval` 與 graph 反序列化 |
| `panel/composables/useDevtoolsConnection.ts` | 封裝 port 連線、`onMessage`、`onNavigated` 監聽與清理 |
| `panel/composables/useLayout.ts` | dagre 佈局 + upstream/downstream BFS 展開 |
| `panel/components/GraphView.vue` | vue-flow 渲染節點與邊 |
| `panel/components/GraphNode.vue` | 單一節點外觀 |
| `panel/components/VariableList.vue` | 左側變數清單 |
| `panel/components/shared/nodeDisplay.ts` | `getDisplayName` 共用函數 |
| `panel/nodeTypeMeta.ts` | 各節點類型的顏色、標籤設定 |

---

## 命名慣例

- 本插件不再對 Vue 響應式物件進行 monkey-patching（已移除 `__vrg_depKey`）
- 若未來需要在 Vue 物件上掛屬性，仍使用 `__vrg_` 前綴，避免與 Vue 內部 `__v_` 前綴衝突

---

## 對話開始必讀

每次對話開始前必須讀取：
- `ARCHITECTURE.md`：三層環境分層、資料流時序、Phase 1 / Phase 2 解析流程圖
- `DESIGN_NOTES.md`：onTrack 限制、追蹤策略索引（setup-state / props / inject / pinia）、DFS 順序重要性

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

大型 Feature / 模糊需求 / 需要拆工：
先使用 `to-prd`，再使用 `to-issues`，最後針對選定 issue 呼叫 `spec-writer` 產出 `spec.md`。

Bugfix / 小型 Refactor / 明確工程修改：
直接呼叫 `spec-writer` 產出 `spec.md`。

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

