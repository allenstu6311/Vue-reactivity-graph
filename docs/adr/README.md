# 決策紀錄（ADR）

本資料夾收 Architecture Decision Records：記錄「**為什麼這樣決定**」（背景、考慮的選項、取捨、後果）。

與「**目前怎麼運作**」的說明文件（`DESIGN_NOTES.md`、`docs/tracking/`）刻意分開，避免決策理由混進當前邏輯的描述。

- ADR：為什麼（背景／選項／取捨／後果）→ 本資料夾
- 現況：怎麼運作（機制／資料結構）→ DESIGN_NOTES.md、docs/tracking/

## 索引

| # | 標題 | 狀態 | 日期 |
|---|---|---|---|
| [0001](0001-decouple-update-trigger-from-data-source.md) | 組件更新觸發源與更新邏輯解耦 | 採用 | 2026-06-20 |

## 格式

每筆 ADR 一檔，命名 `NNNN-kebab-title.md`（例：`0001-generalize-hook-listening.md`），建議包含：

- **背景 / 問題**：當下要解什麼、為何現況不夠
- **考慮的選項**：列出評估過的方案
- **決定**：選哪個
- **後果 / 取捨**：帶來的好處與代價、已知待驗證項
- **狀態**：提議 / 採用 / 取代（被哪筆取代）/ 廢棄

新增 ADR 後，在上方索引表加一行。
