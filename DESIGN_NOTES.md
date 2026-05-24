# Design Notes

本文件記錄 walker / tracker 中各種設計決策。

---

## onTrack 的根本限制

`onTrack` 觸發時只提供兩個資訊：

- `event.target`：被存取的響應式物件本身（object reference）
- `event.key`：存取的屬性名

`resolveDepNode` 只能靠**物件引用**反查到對應的 GraphNode。
如果同一個物件被多個 component 共用，單一 WeakMap 無法區分「是哪個 component 的節點」。

這個限制導致 ref/reactive/computed、props、inject 三種資料各需要不同的追蹤策略。

---

## 追蹤策略（各類型詳見下方文件）

| 類型 | 文件 |
|---|---|
| setupState（ref / reactive / computed） | [docs/tracking/setup-state.md](docs/tracking/setup-state.md) |
| Props | [docs/tracking/props.md](docs/tracking/props.md) |
| Inject | [docs/tracking/inject.md](docs/tracking/inject.md) |
| Pinia storeToRefs | [docs/tracking/pinia.md](docs/tracking/pinia.md) |

---

## Inject Anonymous Node 的補票機制

父層 `collectSetupState` 只掃 `setupState`，`provides` 裡來自外部的值不會自動建節點。
子層 `collectInject` 是第一個能發現「這個被 inject 進來的值，來源沒有對應 GraphNode」的地方，
此時父層的 `updateNodes` 已執行完畢，只能透過 `appendNode`（或直接 push）事後補進父層陣列。

根治需要兩趟 Phase 1 或延遲 flush，目前接受這個 tradeoff。

---

## 深度優先順序的重要性

Phase 1（`collectInstance`）採深度優先遍歷：父層先執行，子層後執行。

這保證了：
- 父層的 `injectRawToNodeMap` 在子層處理 prop 連結之前已經寫入
- Strategy 1 / Strategy 2 查找父層節點時，父層節點必然已存在
- `instanceChildPropKeyMap`（sentinel dry-run 結果）在子層處理之前已由父層建立

若改為廣度優先或其他順序，上述查找會失敗。
