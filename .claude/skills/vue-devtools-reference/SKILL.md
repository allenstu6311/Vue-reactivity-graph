---
name: vue-devtools-reference
description: 當需要參考 Vue 官方 devtools（vuejs/devtools）如何實作某個功能時觸發。優先查本地 clone 的 codegraph 索引，找出對應做法後對照本插件。涉及「vue-devtools 怎麼做」「官方 devtools 的實作」「參考 vuejs/devtools」等需求時載入。
---

# Reference: Vue 官方 DevTools 實作

當使用者要查「Vue 官方 devtools（vue-devtools）某功能怎麼實作」時，**不要憑記憶回答**，依下列優先序到原始碼找對應做法。

## 來源：本地 clone（已存在）

- 本地路徑：`C:\Users\user\Desktop\code\library\devtools`（vuejs/devtools monorepo，主程式在 `packages/`）
- **不爬遠端 GitHub**——已有本地 clone，遠端 WebFetch 只當最後手段。
- 直接對遠端 URL 建 codegraph 索引不可能；codegraph 只吃本地檔案。

## 查找優先序

1. **首選：codegraph MCP（省 token，砍掉沒方向的摸索回合）**
   - `codegraph_search "<symbol/關鍵字>"`：用名稱定位 symbol
   - `codegraph_explore "<架構問題>"`：問「某功能怎麼運作」
   - `codegraph_node` / `codegraph_callers`：取單一 symbol 完整 context、找呼叫處
   - 前提：devtools clone 已跑過 `codegraph init`（見下方「索引維護」）。若 MCP 工具不存在或查無結果 → 走 fallback。

2. **Fallback：Grep 本地 clone（外科手術式）**
   - `Grep` 打領域關鍵字鎖定檔案與行號（只回命中行，不讀整檔）
   - 命中後 `Read` 只讀目標函式範圍（targeted offset/limit），不盲讀大檔
   - 例：找「組件名稱怎麼來」→ Grep `componentName` / `getInstanceName` / `formatComponentName` / `instance.type.__name`

3. **最後手段：WebFetch 遠端**
   - 只在本地 clone 缺檔或需確認最新 main 時用 `https://raw.githubusercontent.com/vuejs/devtools/main/<path>`

## 索引維護

- 首次或久未更新時，在 devtools clone 跑 `codegraph init --index`（或 `--force` 重建）。
- 官方更新後索引會過時 → 需要時 `codegraph init --force` 重建。

## 對照與回報

- 把官方做法與本插件對應模組（見 CLAUDE.md 檔案地圖，如 `walker.ts`、`collect/*`、`subscribers/*`）並列，指出差異與可借鑑處。
- 引用本專案檔案用 markdown clickable 連結；引用官方程式碼附本地路徑（必要時加 GitHub 連結）。

## 注意：架構差異

官方 devtools 走 `@vue/devtools-api` hook + bridge，本插件直接讀 `__vue_app__` 內部狀態並掛 `onTrack`。引用官方做法時要說明此差異，不可假設能直接套用。
