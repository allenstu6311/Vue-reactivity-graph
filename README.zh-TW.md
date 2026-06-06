# Vue Reactivity Graph

> [English](./README.md) | **繁體中文**

一款 Chrome DevTools 外掛，將 **Vue 3 dev mode** 應用中 `ref` / `reactive` 與 `computed` / `watch` 之間的依賴關係視覺化呈現。幫助你一眼看清響應式資料流中誰依賴誰，以及每個變數來自哪個原始檔。

`Vue 3 dev mode` · `tested against Vue 3.5.x` · `Chrome MV3` · `僅限 dev mode` · `TypeScript`

> **TODO：** 此處補上 DevTools 面板的截圖 / GIF。

---

## 功能

- **雙向依賴檢視** — 對任一 dep（`ref` / `reactive`），查看有哪些 sub（`computed` / `watch`）訂閱它；對任一 sub，查看它依賴了哪些 dep。
- **來源檔案標示** — 每個變數顯示其所屬檔案（例如 `CartPanel.vue`、`useCart.js`）。
- **支援 props / inject / Pinia** — 不只追蹤元件內部 state，也追蹤 `props`、`provide` / `inject` 與 Pinia `storeToRefs` 的關係。
- **唯讀** — 只讀取並記錄響應式 metadata，不修改你的應用程式邏輯。（但請見下方關於依賴收集機制的重要警告。）

---

## 需求與限制

**硬性需求**

- 僅支援 Vue 3 — **不支援 Vue 2**。
- **僅限 dev mode** — production build 會移除本工具讀取的內部狀態。
- 具備 DevTools 的 Chromium 系瀏覽器（Chrome、Edge…）。

**已知限制**（每條附詳細說明連結）

- `v-bind="obj"` 內的巢狀 reactive 物件**不會遞迴追蹤** — 詳見 [docs/tracking/props.md](./docs/tracking/props.md)。
- 同一元素上的多個 `v-bind` 會經由 `mergeProps` 合併，走不同的程式碼路徑 — 詳見 [docs/tracking/props.md](./docs/tracking/props.md)。
- inject 值若封裝在 composable 內、原始值從未進到 `setupState`，則不會建立 inject 節點 — 詳見 [docs/tracking/inject.md](./docs/tracking/inject.md)。

---

## ⚠️ 重要 — 對你執行中應用的副作用

> **為了收集依賴關係，本外掛在掃描時會主動重新求值你的 `computed` getter，並重新執行你的 `watch`。**
>
> - 對每個 `computed`，它會強制該值 dirty（更動 `flags` 與 `globalVersion`）再讀取 `.value`，這會**重新執行 computed getter** — 見 [`src/injected/subscribers/computed.ts`](./src/injected/subscribers/computed.ts)。
> - 對每個 `watch`，它會呼叫 `effect.run()`，因此 **watch 的 source / effect runner 可能被重新執行** — 見 [`src/injected/subscribers/watch.ts`](./src/injected/subscribers/watch.ts)。
>
> **為什麼難以避免：** Vue 的 `onTrack` 只在響應式值「實際被讀取」時才回報依賴，因此不主動讀取一次就無法建立依賴圖。詳見 [DESIGN_NOTES.md](./DESIGN_NOTES.md) 中的 `onTrack` 限制。
>
> **後果：** 若某個 getter 或 watch source **不純**（含副作用 — 打 API、改外部狀態、計數器等），它可能被多執行一次，進而造成預期外的行為。重設 `globalVersion` 也可能連帶讓其他 computed 重新計算。
>
> **建議：** 僅在 **dev mode** 使用，切勿用於 production。若你的 `computed` / `watch` 有副作用，請預期它們會在外掛掃描時被多跑一次。

---

## 安裝（從原始碼建置）

本外掛尚未發佈到商店，請從原始碼建置：

1. `pnpm install`
2. `pnpm build` — 將未封裝的外掛輸出到 `dist/`。
3. 開啟 `chrome://extensions/` 並啟用**開發人員模式**。
4. 點選**載入未封裝項目**，選擇 `dist/` 資料夾。
5. 在執行 Vue 3 dev build 的頁面上開啟 DevTools（F12），切換到 **Vue Reactivity Graph** 面板。

---

## 使用方式

1. 開啟一個執行 **Vue 3 dev build** 的頁面。
2. 開啟 DevTools，選擇 **Vue Reactivity Graph** 面板。
3. 從左側**變數清單**選擇一個變數。
4. 右側**圖表檢視**會顯示它的上游（deps）與下游（subs），每個節點標示其型別與來源檔案。

---

## 運作原理

本外掛橫跨三個隔離的瀏覽器執行環境：**injected script** 在頁面 main world 執行以讀取 `__vue_app__` 內部狀態，**content script** 橋接到 **background script**，再由 background 將更新轉發給 **DevTools 面板**。

依賴解析分為兩個階段 — Phase 1（`collectInstance`）建立節點但不觸發訂閱，Phase 2（`triggerInstance`）掛上 `onTrack` hook 並回填依賴邊。

完整內容請見：

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 環境分層、資料流時序、Phase 1 / Phase 2 流程圖。
- [DESIGN_NOTES.md](./DESIGN_NOTES.md) — `onTrack` 限制與各型別追蹤策略索引。
- [docs/tracking/](./docs/tracking/) — setup-state、props、inject、Pinia 的詳細策略說明。

---

## 開發

| 指令 | 說明 |
|---|---|
| `pnpm dev` | 監聽模式建置（變更時自動重建）。 |
| `pnpm build` | 一次性建置輸出到 `dist/`。 |
| `pnpm typecheck` | 以 `vue-tsc` 型別檢查（不輸出）。 |
| `pnpm test` | 執行所有單元測試（`vitest run`）。 |

測試檔位於 `src/injected/__tests__/*.test.ts`。執行單一測試檔：

```bash
pnpm vitest run src/injected/__tests__/props.test.ts
```

**技術棧：** Vue 3 + Vite + TypeScript + pnpm，搭配 [@vue-flow/core](https://github.com/bcakmakoglu/vue-flow) 與 [@dagrejs/dagre](https://github.com/dagrejs/dagre) 進行圖表佈局，並以 Pinia 進行 store 追蹤。

---

## 專案結構

精簡版原始碼地圖 — 完整逐檔說明請見 [CLAUDE.md](./CLAUDE.md)。

| 區塊 | 職責 |
|---|---|
| `src/injected/` | 在頁面 main world 執行：遍歷 Vue 元件樹、建立節點、綁定 `onTrack` hook。 |
| `src/graph/` | 純型別與全域圖表狀態（`GraphData`、`GraphNode`、`ComponentMeta`）。 |
| `src/panel/` | DevTools 面板 UI — 變數清單、圖表檢視（Vue Flow）、佈局。 |
| `src/content/`、`src/background/`、`src/devtools/` | 頁面與面板之間的訊息橋接。 |

---

## 疑難排解

| 症狀 | 處理方式 |
|---|---|
| DevTools 面板沒有出現 | 確認已載入未封裝外掛並指向 `dist/`，然後關閉再重新開啟 DevTools。 |
| 圖表是空的 / 沒有節點 | 確認被檢視的頁面是 **Vue 3 dev build** — production build 不會暴露可讀取的內部狀態。 |
| 資料沒有更新 | 重新整理被檢視的頁面，或關閉再重新開啟 DevTools。 |

---

## 貢獻

歡迎貢獻。本專案計畫公開開源，請留意以下原則：

- **避免 monkey-patching** Vue 響應式物件，除非有充分且有說明的理由。
- **型別設計要可讀** — 貢獻者應能快速理解意圖，而不只是確認目前沒有 bug。
- **侵入性操作需有說明** — 任何掛載到或更動 Vue 內部狀態的操作都需要清楚說明（或更乾淨的替代方案）。

關於 agent 驅動的開發流程與內部工程筆記，請見 [CLAUDE.md](./CLAUDE.md)、[ARCHITECTURE.md](./ARCHITECTURE.md) 與 [DESIGN_NOTES.md](./DESIGN_NOTES.md)。

> **TODO：** 預計補上專屬的 `CONTRIBUTING.md`。

---

## 授權

> **TODO：** 選擇授權條款。
