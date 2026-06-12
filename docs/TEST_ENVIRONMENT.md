# 測試環境建置指南

這份文件說明如何在**另一台電腦**從零建立一個能驗證 Vue Reactivity Graph 插件的測試 app（playground），
以及把插件載進瀏覽器、連上 DevTools panel 的完整流程。

測試 app 與插件是**兩個獨立專案**：

- 插件本體：`Vue-reactivity-graph`（這個 repo）→ build 出 `dist/`，載入瀏覽器當擴充功能。
- 測試 app：一個獨立的 Vue 3 dev server，被插件「讀取」。本文件教你建這個。

---

## 0. 插件對測試 app 的硬性要求（先看這個）

這些不是建議，是不滿足就**完全讀不到資料**的條件：

| 要求 | 原因（程式碼依據） | 不滿足的後果 |
|---|---|---|
| **掛載點 id 必須是 `app`** | `src/injected/index.ts` 的 `initialScan()` 寫死 `document.querySelector("#app")?.__vue_app__?._instance` | 掃描永遠拿不到 root instance，圖是空的 |
| **必須 dev mode**（非 production build） | 插件讀 Vue 未公開內部：`effect`、`flags`、computed `onTrack`、setupState raw 等；production 會 strip 掉 | computed/watch 偵測失效、`__VUE_DEVTOOLS_GLOBAL_HOOK__` 行為不同 |
| **Vue 版本對齊 `3.5.x`** | 插件依賴 `ComputedRefImpl.flags` 的 bit 定義（DIRTY=1<<4、EVALUATED=1<<7）與 `refreshComputed` 行為，這些是 3.5 的內部實作 | 換大版本（3.4 / 3.6+）內部結構可能改變，force-eval / onTrack 邏輯失準 |
| **跑在 http(s) 頁面**（localhost dev server 即可） | content script `matches: ["<all_urls>"]`，但 `file://` 預設不注入 | 用 `file://` 開頁面插件不會啟動 |
| **依賴 `__VUE_DEVTOOLS_GLOBAL_HOOK__`** | 增量更新（導航後晚 mount 的子樹）靠 Vue 發的 `component:added` 事件，而 Vue 只在這個 hook 存在時才發 | 初始畫面能掃到，但導航後新子樹補不上（見「疑難排解」） |

> 對齊版本最穩的做法：把測試 app 的 `vue` 也鎖在跟插件 `package.json` 相同的 `^3.5.13`。

---

## 1. 建立 Vue 專案骨架

```bash
# 用 Vite 官方 vue-ts 範本
pnpm create vite vue-rg-playground --template vue-ts
cd vue-rg-playground

# 對齊 Vue 版本（重要）
pnpm add vue@^3.5.13

# 測試各節點類型需要的套件
pnpm add pinia vue-router
pnpm add element-plus            # 可選：重現 template ref → DOM/元件 的邊界情境

pnpm install
```

---

## 2. 確認掛載點是 `#app`

`index.html`（Vite 範本預設就是 `#app`，確認一下別改掉）：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>VRG Playground</title>
  </head>
  <body>
    <div id="app"></div>   <!-- 必須 id="app" -->
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

## 3. 放入能覆蓋「每一種節點類型」的範例

插件會偵測這些 `NodeType`：`ref` / `reactive` / `computed` / `watch` / `store` / `prop` / `inject`。
下面這組檔案剛好把每一種都用到，外加一個**懶載入路由**來重現「RouterView 子樹晚 mount」的情境。

### `src/main.ts`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './router'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(ElementPlus)
  .mount('#app')          // ← 必須掛 #app
```

### `src/router.ts`

```ts
import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    // 懶載入：導航過去時才 mount → 重現 RouterView 子樹晚出現、需靠 component:added 增量補上
    { path: '/lazy', component: () => import('./views/Lazy.vue') },
  ],
})
```

### `src/stores/counter.ts`（store：ref state + computed getter）

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)                              // store ref state
  const double = computed(() => count.value * 2)    // store getter（computed）
  function inc() { count.value++ }
  return { count, double, inc }
})
```

### `src/App.vue`

```vue
<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
import Parent from './components/Parent.vue'
</script>

<template>
  <nav>
    <RouterLink to="/">Home</RouterLink> |
    <RouterLink to="/lazy">Lazy</RouterLink>
  </nav>
  <Parent />
  <RouterView />
</template>
```

### `src/components/Parent.vue`（ref / reactive / computed / watch / provide / 傳 prop）

```vue
<script setup lang="ts">
import { ref, reactive, computed, watch, provide } from 'vue'
import Child from './Child.vue'

const firstName = ref('Ada')                            // ref
const profile = reactive({ age: 20 })                   // reactive
const greeting = computed(() => `Hi ${firstName.value}`) // computed → 依賴 firstName

watch(firstName, (v) => console.log('name changed', v)) // watch → 依賴 firstName

const theme = ref('dark')
provide('theme', theme)                                 // provide → 給 Child inject
</script>

<template>
  <div>
    <input v-model="firstName" />
    <p>{{ greeting }} / age {{ profile.age }}</p>
    <!-- 傳 prop 給 child：測 prop 來源連結（Strategy 1 同名查找） -->
    <Child :name="firstName" />
  </div>
</template>
```

### `src/components/Child.vue`（prop / inject）

```vue
<script setup lang="ts">
import { inject } from 'vue'

const props = defineProps<{ name: string }>()  // prop ← Parent 傳入
const theme = inject<string>('theme')           // inject ← Parent provide
</script>

<template>
  <p>child sees {{ props.name }}, theme {{ theme }}</p>
</template>
```

### `src/views/Home.vue`（store + storeToRefs）

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCounterStore } from '../stores/counter'

const store = useCounterStore()
const { count, double } = storeToRefs(store)   // 測 storeToRefs ref/getter 追蹤
</script>

<template>
  <div>
    <p>count {{ count }}, double {{ double }}</p>
    <button @click="store.inc()">+1</button>
  </div>
</template>
```

### `src/views/Lazy.vue`（晚 mount 子樹 + 自己的 computed）

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const n = ref(1)
const square = computed(() => n.value * n.value)  // 導航過來後才建立的 computed
</script>

<template>
  <div>
    <p>lazy square {{ square }}</p>
    <button @click="n++">n + 1</button>
  </div>
</template>
```

---

## 4. 啟動測試 app

```bash
pnpm dev
```

記下 Vite 給的網址（通常 `http://localhost:5173`）。**保持 dev server 開著**。

---

## 5. Build 並載入插件

在**插件 repo**（`Vue-reactivity-graph`）：

```bash
pnpm install      # 第一次在新電腦要先裝
pnpm build        # 產出 dist/（兩個 Vite build 都寫進同一個 dist/）
# 開發時可用 pnpm dev（watch 模式），改完不用每次手動 build
```

載入擴充功能：

1. 瀏覽器開 `chrome://extensions/`
2. 開啟右上「開發人員模式」
3. 「載入未封裝項目」→ 選插件的 `dist/` 資料夾
4. 之後改了程式碼重新 `pnpm build`，回此頁按該擴充的「重新整理」圖示

---

## 6. 連上 DevTools panel

1. 在**測試 app 分頁**（localhost:5173）按 F12 開 DevTools
2. 找到 **Vue Reactivity Graph** 分頁（DevTools 頂端分頁列，可能在 `»` 收合選單裡）
3. 應該看到節點圖。若空白，重整測試 app 分頁

---

## 7. 驗證 checklist

逐項確認插件有正確抓到（對應上面範例）：

- [ ] **ref**：`firstName`
- [ ] **reactive**：`profile`
- [ ] **computed**：`greeting`，且 deps 連到 `firstName`
- [ ] **watch**：watch 節點，deps 連到 `firstName`
- [ ] **prop**：Child 的 `name`，連回 Parent 的 `firstName` 來源
- [ ] **inject**：Child 的 `theme`，連回 Parent provide 的 `theme`
- [ ] **store**：`counter` 的 `count` / `double`，且 Home 的 `count`/`double` 連到 store
- [ ] **晚 mount 子樹**：點 `Lazy` 導航 → `Lazy.vue` 出現在圖上、`square` 的 deps 連到 `n`
  - Console 應印 `[VRG][MVP] incremental collect uid=… name=Lazy …`

---

## 8. 疑難排解

**整張圖空白**
- 掛載點不是 `#app`？（最常見）
- 不是 dev mode？用 `pnpm dev`，不要用 `pnpm build`/`pnpm preview` 的 production 產物。
- 用 `file://` 開頁面？改用 dev server 的 http 網址。

**初始畫面有、但導航到 Lazy 後子樹補不上**
- 這條路靠 Vue 發 `component:added` 給 `__VUE_DEVTOOLS_GLOBAL_HOOK__`。若該 hook 在 app 初始化時不存在，Vue 不會發事件。
- 暫時驗證手段：同時安裝官方 **Vue.js devtools** 擴充（它會在頁面注入該 hook），再重整測試 app。
- 看 Console 有沒有 `[VRG][MVP] incremental collect …`：沒有 → 事件沒進來（hook 問題）；有但圖沒更新 → 收集/序列化問題。

**computed 的 deps 是空的**
- 確認 `src/injected/subscribers/computed.ts` 的 `markComputedDirtyAndEval` 三行 force-eval（`flags |= 1<<4`、`flags &= ~(1<<7)`、`globalVersion = -1`）都在、沒被註解。

**CPU 衝到 100%**
- 多半是 onTrack handler 沒被 detach 而常駐，使 app 每次響應式活動都觸發全量 refresh。詳見 `DESIGN_NOTES.md` 的 onTrack 限制。

**節點結構怪異 / 偵測不到 computed**
- 檢查測試 app 的 `vue` 版本是否仍是 `3.5.x`（`pnpm why vue`）。大版本不同會讓內部結構對不上。

---

## 9. 最小版本（不想裝 router/pinia/element-plus）

只想快速看圖能不能動，最小組合是：`index.html`（`#app`）+ `main.ts`（`.mount('#app')`）+ 一個含 `ref` + `computed` 的 `App.vue`。
其餘套件都是為了覆蓋對應的節點類型，可按需要增減。
