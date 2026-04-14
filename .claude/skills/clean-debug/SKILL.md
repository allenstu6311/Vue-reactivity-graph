---
name: clean-debug
description: 掃描並移除專案中的 console.log 殘留
allowed-tools: Grep Edit Bash
---

掃描 `src/` 下所有 TypeScript / JavaScript 檔案中的 `console.log`，逐一移除，完成後確認無殘留。

步驟：
1. 用 Grep 找出所有含 `console.log` 的檔案與行號
2. 逐檔用 Edit 移除對應行
3. 再跑一次 Grep 確認清零
4. 回報移除了哪些檔案的哪幾行
