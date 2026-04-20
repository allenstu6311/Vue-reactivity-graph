掃描 `src/` 下所有 TypeScript / JavaScript 檔案中的 `console.log`，逐一移除，完成後確認無殘留。

步驟：
1. 用 Grep 找出所有含 `console.log` 的檔案與行號
2. 逐檔檢視每一行，判斷是否位於條件式內（例如 `if (...)`, `? ... :` 等）：
   - 若是條件式的一部分（如 `if (debug) console.log(...)` 或條件式 body 內），**保留不動**
   - 否則移除
3. 再跑一次 Grep 確認無殘留（保留的條件式內 console.log 除外）
4. 回報：移除了哪些檔案的哪幾行，以及保留了哪幾行（並說明原因）
