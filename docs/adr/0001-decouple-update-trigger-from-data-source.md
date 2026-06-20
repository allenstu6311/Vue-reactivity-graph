# 0001 — 組件更新觸發源與更新邏輯解耦

- **狀態**：採用
- **日期**：2026-06-20

## 背景 / 問題

插件需要在「初次 scan 之後」的 runtime 組件變動（路由切換、`v-if`/`v-for`、`defineAsyncComponent`）時重掃 graph。現況只有 HMR 與初次載入會觸發 `runScan`，這些 runtime 變動追不到（詳見 `DESIGN_NOTES.md`「HMR 掃描行為（現況 baseline）」）。

要偵測「組件變動了」這個**訊號**，有多種來源，且這個來源**本質上獨立於「重掃」這件事**。

## 考慮的選項

偵測組件變動的訊號來源：

- **A 搭便車既有 hook**：監聽 `window.__VUE_DEVTOOLS_GLOBAL_HOOK__` 的 `component:added` / `component:removed`（以及 `component:updated`，僅供 HMR rerender 捕捉 override；事件矩陣見 spec）。`__VUE_DEVTOOLS_GLOBAL_HOOK__` 是 Vue 官方定義、供 devtools 整合的接口（Vue 在 renderer init 讀此 key 並 emit），但 **Vue 自己不建立此物件**，需由外部建立（官方 vue-devtools 擴充或 `vite-plugin-vue-devtools`）。
- **B 自建 hook**：自己建立 `__VUE_DEVTOOLS_GLOBAL_HOOK__`，不依賴外部。但 Vue 在 renderer init **只讀一次並快取**（`emit` 用快取的模組變數，不重讀 window）；injected 腳本在 app mount 後才執行（太晚），需主動執行 `__VUE_DEVTOOLS_HOOK_REPLAY__` 握手，且受 Vue 約 3 秒 buffer 時限限制。
- **C 不用 hook**：DOM MutationObserver 或定時 polling 偵測變動。完全不依賴 devtools，但需換一套偵測機制。

## 決定

**1. 本階段採用方案 A**（搭便車既有 hook）作為訊號來源。

理由：實際使用情境下 hook 本來就存在（開發者裝了 devtools 或專案用了 vite plugin），改動最小；B 的時序複雜度（replay / 3 秒時限 / 共存覆蓋）與 C 的另一套機制都不是現在要付的成本。

**2. 將「訊號來源 / 訊息處理」與「更新邏輯（`runScan`）」完全解耦。**

- 訊號來源以獨立模組封裝（監聽 hook 事件、debounce），對外只發出「組件變動了，請重掃」的訊號（callback）。
- 更新邏輯（`runScan` + refreshGraph）不知道訊號從哪來。
- 兩者只透過 callback 介面溝通。
- hook 專屬細節（含 HMR override 捕捉）留在 hook 來源模組內，不外洩到更新邏輯。

## 後果

- **依賴**：本階段依賴外部（vue-devtools 擴充或 vite plugin）已建立 hook。乾淨環境（完全沒裝任何 devtools）不支援 live 更新——行為降級為**不崩潰、僅初次 scan**，不再因裸存取 `hook.emit` 而 throw。
- **可換源**：因來源與更新解耦，未來若改走方案 B（自建 hook 求獨立）或 C（DOM/polling），只需替換「訊號來源」模組，`runScan` 與更新邏輯不動，影響面小。
- **已知限制（延後）**：方案 B 的 hook 自建時序、`Object.assign` 共存覆蓋等問題，因本階段**不自建 hook** 而不存在；未來若採 B 再處理。
