# Architecture

## 環境分層

專案橫跨三個隔離的瀏覽器執行環境：

```mermaid
graph TB
    subgraph PageWorld["🌐 Page Main World"]
        VueApp["User's Vue App\n(__vue_app__)"]
        Injected["injected.js\n(walker + tracker)"]
        GlobalGraph["window.__vueReactivityGraph"]
    end

    subgraph IsolatedWorld["🔒 Isolated World"]
        Content["content.js\n(inject script tag)"]
    end

    subgraph ExtBg["⚙️ Background Script"]
        Background["background.js\n(port 管理)"]
    end

    subgraph DevToolsCtx["🛠 DevTools Context"]
        Panel["Panel UI\n(App.vue + GraphView)"]
    end

    Content -->|script injection| Injected
    Injected -->|reads| VueApp
    Injected -->|writes| GlobalGraph
    Injected -->|postMessage| Content
    Content -->|sendMessage| Background
    Background -->|port.postMessage| Panel
    Panel -->|eval| GlobalGraph
```

## 資料流時序

```mermaid
sequenceDiagram
    participant Page as Page (Main World)
    participant Content as Content Script (Isolated)
    participant Background as Background Script
    participant DevTools as DevTools Panel

    Content->>Page: 注入 <script src="injected.js">
    Note over Page: injected.js 在 Main World 執行
    Page->>Page: walker.ts 遍歷 Vue component tree
    Page->>Page: tracker.ts 掛載 onTrack hooks
    Page->>Page: 依賴關係寫入 window.__vueReactivityGraph
    Page->>Content: window.postMessage('VUE_GRAPH_UPDATE')
    Content->>Background: chrome.runtime.sendMessage
    Background->>DevTools: port.postMessage('VUE_GRAPH_UPDATE')
    DevTools->>Page: chrome.devtools.inspectedWindow.eval()
    Page-->>DevTools: JSON.stringify(__vueReactivityGraph)
    DevTools->>DevTools: 渲染 VariableList + GraphView (Vue Flow)
```

## Component 解析流程

### Phase 1 — collectInstance（建節點，不觸發訂閱）

```mermaid
graph TD
    A([collectInstance]) --> B[取 rawSetupState\ninstance.setupState.__v_raw]

    B --> C{有 propsOptions?}
    C -->|是| D[rawPropsObj = instance.props.__v_raw\npropKeyNodeMap.set rawPropsObj, propMap]
    D --> E[每個 propKey → 建 propNode]
    E --> F{找父層來源}
    F -->|Strategy 1 同名| G[parentRawSetupState 同名值\n→ valNodeMap.get val]
    F -->|Strategy 2 異名| H[instanceChildPropKeyMap\n查 sentinel dry-run 結果]
    G --> I[propNode.deps / parentNode.subs 互連]
    H --> I
    C -->|否| J

    I --> J{有 parentProvides?}
    J -->|是| K[建 provideValToNode\nparentProvides 每個值 → valNodeMap.get val]
    K --> L[rawSetupState 每個值比對 provideValToNode]
    L --> M[命中 → injectKeySet.add\n建 injectNode\nval = val.__v_raw ?? val\nparentNode.subs 加入]
    M --> N[不寫入 valNodeMap\n避免兄弟 component 互蓋]
    J -->|否| O

    N --> O[collectSetupState\n跳過 props 與 injectKeySet]
    O --> P[每個 key\nval.__vrg_depKey = key\nbuildNode 判斷型別\nvalNodeMap.set val, node]

    P --> Q[建 watch 節點\nscope.effects 排除 render effect\nw_0, w_1...]

    Q --> R[Sentinel Dry-run\n暫換 setupState 為 sentinelProxy\n呼叫 render 取 VNode tree\n還原 setupState]
    R --> S[traverseVNodeForSentinels\n掃 VNode props 中的 Symbol\n建立 childType → propName → parentKey 對應表\ninstanceChildPropKeyMap.set instance, map]

    S --> T[updateGraph\ncollectVNode 遞迴子樹]
```

---

### Phase 2 — triggerInstance（掛 onTrack，手動觸發，填 deps / subs）

```mermaid
graph TD
    A([triggerInstance]) --> B[Inject Override\n必須在 bindSetupTrack 之前]
    B --> C[每個 inject node\nraw = node.val.__v_raw ?? node.val\nvalNodeMap.set raw, injectNode\nraw.__vrg_depKey = node.varName\n每個 component 循序執行不互蓋]

    C --> D[bindSetupTrack\n每個 val.fn computed]
    D --> E[掛 val.onTrack]
    E --> F[強制 dirty\nflags, globalVersion = -1\nval.value 觸發 getter]
    F --> G[onTrack 觸發\ndepName = target.__vrg_depKey ?? event.key\nsubNode.deps.push depName]
    G --> H[resolveDepNode]

    subgraph resolveDepNode
        H1[valNodeMap.get target\nref / reactive after inject override]
        H2[valNodeMap.get rawSetupState depName\nPinia store fallback]
        H3[propKeyNodeMap.get target .get key\nprops primitive fallback]
        H1 --> H2 --> H3
    end

    H --> H1
    H --> I[depNode.subs.push subName\nprop / inject 用完整 ID\n其他用 local key]

    I --> J[Watch Effects\n每個 watchEffect 掛 onTrack\neffect.run 觸發]

    J --> K[triggerVNode 遞迴子樹]
```

---


## 為什麼需要 injected 模式

Content script 運行在 Isolated World，無法存取頁面的 `window.__vue_app__`。
透過動態注入 `<script>` 標籤，讓腳本在 Page Main World 執行，才能讀取 Vue 的 internal reactive 狀態。


