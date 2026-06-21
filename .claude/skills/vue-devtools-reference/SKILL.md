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

> 重點：查 devtools 是**跨 repo**（站在 myExtension 查另一個專案）。codegraph 官方主推的 MCP 只服務「當前 workspace」，跨不到 devtools，**所以這裡首選 CLI，不是 MCP**。

1. **首選：codegraph CLI（能查任何 repo，省 token）**
   - 必須在同一行 `cd` 進 clone 再下指令（每次 Bash 呼叫後 cwd 會重置回 myExtension）：
     ```bash
     cd "C:/Users/user/Desktop/code/library/devtools" && codegraph explore "<架構問題>"
     cd "C:/Users/user/Desktop/code/library/devtools" && codegraph node <symbol或檔案路徑>
     ```
   - **兩段式最省 token**：先 `explore` 粗定位核心檔 → 再 `node` 精準鎖定該 symbol/檔，不讀整檔。
   - 其他子指令：`query <關鍵字>`（找 symbol）、`callers <symbol>`（找呼叫處）。
   - CLI 是純文字 stdout，輸出大時加 `| head -N` 控制量，避免整包灌進 context。
   - 問法要準：太口語的語意搜尋會夾帶不相關結果（UI 元件等），鎖定領域名詞。

2. **（不適用）codegraph MCP**
   - MCP server 綁當前 workspace（myExtension），跨不到 devtools repo，查官方做法時用不上，別試。
   - 例外：若哪天替 myExtension 自己建了索引，查**自己專案**才輪到 MCP。

3. **Fallback：Grep 本地 clone（外科手術式）** —— 只在 CLI 查無結果時用
   - `Grep` 打領域關鍵字鎖定檔案與行號（只回命中行，不讀整檔）
   - 命中後 `Read` 只讀目標函式範圍（targeted offset/limit），不盲讀大檔
   - 例：找「組件名稱怎麼來」→ Grep `componentName` / `getInstanceName` / `formatComponentName` / `instance.type.__name`

4. **最後手段：WebFetch 遠端**
   - 只在本地 clone 缺檔或需確認最新 main 時用 `https://raw.githubusercontent.com/vuejs/devtools/main/<path>`

## 索引維護

- 索引**已存在**：`.codegraph/` 是本機產物（git 不追蹤），平時不用重建。
- devtools clone 有 `git pull` 更新後，`cd` 進去跑 `codegraph sync`（增量同步）即可。
- 不確定新舊時跑 `codegraph status` 確認（會顯示 `Index is up to date` 或落後）。
- 真要砍掉重建才用 `codegraph init`（少用）。

## 對照與回報

- 把官方做法與本插件對應模組（見 CLAUDE.md 檔案地圖，如 `walker.ts`、`collect/*`、`subscribers/*`）並列，指出差異與可借鑑處。
- 引用本專案檔案用 markdown clickable 連結；引用官方程式碼附本地路徑（必要時加 GitHub 連結）。

## 注意：架構差異

官方 devtools 走 `@vue/devtools-api` hook + bridge，本插件直接讀 `__vue_app__` 內部狀態並掛 `onTrack`。引用官方做法時要說明此差異，不可假設能直接套用。
