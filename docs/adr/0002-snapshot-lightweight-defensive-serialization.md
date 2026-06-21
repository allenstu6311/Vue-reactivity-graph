# 0002 — snapshot 值序列化採輕量防禦，不採 devtools 完整方案

- **狀態**：採用
- **日期**：2026-06-21

## 背景 / 問題

`snapshot()`（`src/injected/helper/nodes.ts`）把每個節點的響應式值序列化進 graph，經 `inspectedWindow.eval` 的 JSON 字串傳到 panel，由 `ValTree.vue` 渲染。

原本只防循環（共用 `seen` WeakSet → `'[Circular]'`），對以下情境無防禦，會爆 stack 或讓整張圖序列化失敗（panel 拿到 `null`）：深層無環巢狀、getter 每次回傳新物件（`seen` 永不命中）、值持有 Vue component instance（順著 parent/subTree/vnode 爬進整張 Vue 物件圖）、BigInt（`JSON.stringify` throw）、超大陣列 / 字串。

需要決定「值序列化要做到多完整」——尤其官方 vue-devtools 已有一套成熟做法可參考。

## 考慮的選項

- **A 輕量防禦（本次）**：lossy 標記（`'[MaxDepth]'` / `'[VueComponent]'` / `'[Circular]'`）+ BigInt 轉字串 + 陣列/字串大小上限。配合原生 `JSON.stringify` / `JSON.parse`，panel 端零 decoder。
- **B 完整照搬 devtools**：
  - 循環/共享結構用 `encode`/`decode` 的 index 編碼無損保留（`transfer.ts` 把物件圖攤平成 list，循環變索引引用）；
  - Map/Set/Date/RegExp/BigInt/Function 各有 `getXxxDetails` 豐富序列化；
  - undefined/NaN/Infinity 用 token map 雙向 round-trip 保留。
  - 需換掉整條 JSON 管線、在 panel 端新增 reviver/decoder、改 ValTree 渲染。

（參考來源：本地 clone `C:\Users\user\Desktop\code\library\devtools` 的 `packages/devtools-kit/src/core/component/state/{replacer,reviver,util,constants}.ts` 與 `shared/transfer.ts`。）

## 決定

採用 **A（輕量防禦）**。

理由：
- **定位不同**：本插件是依賴關係圖，`val` 只是「節點現值預覽」的配角；devtools 是通用 state 檢視器，值本身是主角，需可展開、可編輯、精確顯示每種型別。把值做到極致豐富對本插件核心價值（看依賴連線）邊際效益低。
- **通道不同（只讀單向）**：本插件走 `inspectedWindow.eval` 回 JSON 字串、單向只讀；devtools 那套 `encode`/`decode` 與雙向 token round-trip 是為「值能被改、再傳回頁面」設計的，搬進來是死重量。
- **開源可讀性**：方案 B 一大坨「為可編輯而生」的序列化邏輯會大幅拉高貢獻者要理解的複雜度，但本插件用不到可編輯。

從 devtools 借用的部分：陣列/字串大小上限值（`MAX_ARRAY_SIZE = 5000`、`MAX_STRING_SIZE = 10000`，與 devtools 一致）、Vue instance 偵測思路（`isVueInstance`，並補上 devtools 未覆蓋的「內部 instance」形態）。

## 後果

- **好處**：改動面最小（只動 `snapshot` 一函數 + 三個常數 + 一個 helper），panel 端完全不動；契合「依賴圖、val 為預覽」定位。
- **已知 lossy 代價（接受）**：
  - 循環/共享結構無法無損保留——真循環標 `'[Circular]'`；且因 `seen` 為整棵樹共用，**共享（非循環）的 DAG ref 會被誤標 `'[Circular]'`**。
  - Map/Set/Date 顯示成 `{}` 或字串（範圍 B 不美化，但已驗證不會讓 `JSON.stringify` 炸掉）。
  - undefined/NaN/Infinity 經原生 JSON round-trip 會失真（undefined 整個 key 消失、NaN/Infinity → null）。
  - `MAX_DEPTH = 20`：合法超過 20 層的業務物件會提前以 `'[MaxDepth]'` 截斷顯示——僅 DevTools 顯示問題，不影響應用本身。
- **可換**：未來若 `val` 顯示需求升級（要看循環/共享結構或豐富型別），再開獨立任務搬 devtools 的 `encode`/`decode` + panel reviver + ValTree 支援，屆時**取代本 ADR**。

相關：規格見根目錄 `spec.md`；現況機制見 `CLAUDE.md`「圖表資料結構」`val` 說明。
