# Tracking: Inject

## 根本限制：shared reference

`inject()` 不複製值，回傳的是與 `provide()` 完全相同的 RefImpl 引用。

```
A.num (RefImpl)
  ├─ B inject → 同一個 RefImpl
  └─ C inject → 同一個 RefImpl
```

`event.target` 完全相同，無法用 `valNodeMap` 區分「這次 onTrack 在哪個 component」。
若覆寫 `valNodeMap`，最後一個執行 inject override 的 component 會污染所有後續查找，
導致第三、四層 component 的 props 連結到錯誤的節點。

## 解法：key 用共用引用，value 存自己的節點

- **Phase 1：`injectRawToNodeMap`（module-level WeakMap）**
  - key：父層 RefImpl（共用引用，不修改）
  - value：子層自己建立的 inject node（per-component）
  - 深度優先遍歷保證父層先寫，子層 prop 連結時查得到
  - 刻意不寫入 `valNodeMap`，避免兄弟 component 互蓋

- **Phase 2：`injectRawToLocalNode`（per-component local Map）**
  - 每次 `triggerInstance` 重建，只包含當前 component 的 inject nodes
  - `resolveDepNode` 優先查這個 Map，命中即返回正確節點
  - 不跨 component 共享，無污染問題

## `resolveDepNode` 查找順序

```
injectRawToLocalNode.get(target)          // inject（per-component，優先）
  ?? valNodeMap.get(target)               // ref / reactive / computed
  ?? valNodeMap.get(rawSetupState[depName]) // Pinia store fallback
  ?? propKeyNodeMap.get(target)?.get(key) // props（target 是 rawPropsObj）
```
