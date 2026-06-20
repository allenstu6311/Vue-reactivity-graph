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

---

## HMR 掃描行為（現況 baseline）

> 本節記錄「第一階段一般化監聽」實作**之前**的行為，作為重構時「必須保留行為」的對照基準。實作後需回頭更新本節。相關決策見 [docs/adr/README.md](docs/adr/README.md)。

1. **觸發來源限定 HMR**：`patchHmrRuntime` 攔 `__VUE_HMR_RUNTIME__` 的 `reload` / `rerender`，把改動的 `hmrId` 記進 `pendingHmrIds`；`setupHmrHook` monkey-patch `hook.emit`，在 `component:added` / `component:updated` 且 `pendingHmrIds` 命中該 instance 的 `__hmrId` 時才轉交 `onHmrScan`。
   → 現況**已經在用 `__VUE_DEVTOOLS_GLOBAL_HOOK__` 監聽 component 事件**，只是限定在 HMR 範圍。

2. **掃描是全量、從 root**：`onHmrScan` 最終呼叫 `runScan(vueApp._instance, ctx)`。`vueApp` = `component.appContext.app`（app 物件），`vueApp._instance` = root（Vue 原始碼 `app._instance = vnode.component`）。`runScan` 內部 `clearGraph()` + `ctx.reset()` + 從 root 全樹跑 Phase 1 / Phase 2。
   → **不是增量、不是從被改的組件局部開始**。

3. **`resolveInstance` 是節點層級替換，不是遞迴起點**：`collectInstance` / `triggerInstance` 每個節點開頭呼叫 `ctx.resolveInstance(rawInstance)`；只有 `__hmrId` 命中 `hmrOverrideMap` 的節點會被換成 emit 抓到的新 instance。遞迴起點仍是 root、整棵樹照走；被改的組件是「被 root-down 遍歷走到」才處理，不是從它開始。

4. **`hmrOverrideMap` 的用途**：HMR reload 後 vnode 樹的 `.component` 可能仍指向 stale instance；override 在遍歷走到該節點時，用 emit 事件帶來的新 instance 取代，確保讀到 reload 後狀態。掃描結束（`finally`）即 `delete`，僅在單次 scan 期間有效。

**已知待驗證（第一階段相關）**：改為一般化 debounced 監聽後，因為是 trailing scan、樹已 settle，`hmrOverrideMap` / `resolveInstance` 是否還必要——先保留，驗證後再決定移除。
