針對當前分支與 master 的差異進行模擬合併分析，產出報告，不執行實際合併。

步驟：
1. 執行 `git rev-parse --abbrev-ref HEAD` 取得當前分支名稱
2. 執行 `git log master..HEAD --oneline` 取得 commit 清單
3. 執行 `git diff master...HEAD` 取得完整差異
4. 分析差異內容，將所有發現依下列等級分類：
   - **CRITICAL**：會導致功能錯誤、資料遺失、安全漏洞、或破壞性 API 變更
   - **HIGH**：潛在 bug、效能嚴重下降、缺少必要的錯誤處理
   - **MEDIUM**：code quality 問題、不符合專案慣例、缺少型別標注
   - **LOW**：命名建議、可讀性改善、冗餘代碼
5. 將報告寫入根目錄 `merge-report.md`（若已存在直接覆蓋）

報告格式：
```
# Merge Report: {branch} → master
**日期**：{date}
**Commits**：{count} commits

## Commit 清單
- {commit list}

## 變更檔案總覽
- {changed files with +/- line counts}

## 問題分析

### 🔴 CRITICAL
{問題列表，若無則標示「無」}

### 🟠 HIGH
{問題列表，若無則標示「無」}

### 🟡 MEDIUM
{問題列表，若無則標示「無」}

### 🔵 LOW
{問題列表，若無則標示「無」}

## 總結建議
{是否建議合併，以及需要處理的優先事項}
```
