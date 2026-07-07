// Phase 2 — Pinia Store 追蹤
// 測試 store 的 ref / reactive / computed 透過 storeToRefs 解構後，deps / subs 連線正確
// 驗收標準見 TEST_PLAN.md Phase 2
import { describe, it, expect } from 'vitest'
import { defineComponent, computed, watch, h } from 'vue'
import { defineStore, storeToRefs, createPinia } from 'pinia'
import { ref, reactive } from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
import type { GraphNode } from '../../graph'

// ── Test store ────────────────────────────────────────────────────────────
const useTestStore = defineStore('test', () => {
  const count  = ref(0)
  const items  = reactive({ size: 0 })
  const double = computed(() => count.value * 2)
  return { count, items, double }
})

// ── Market store（demo 風格 fixture，含多 state、條件分支、私有 ref）──
const useMarketStore = defineStore('market', () => {
  const activeCategoryCode = ref('all')
  const markets = reactive({ list: [] })
  const favoriteMarkets = ref([])   // 私有：故意不 return，驗證「未回傳 ref」限制
  const filteredMarkets = computed(() => {
    if (activeCategoryCode.value === 'favorites') return favoriteMarkets.value
    return markets.list.length > 0 ? markets.list : []  // 讀 reactive property 以觸發 track
  })
  return { activeCategoryCode, markets, filteredMarkets }
})

// ── Cross-store stores（regression fixture，同名 key + 跨 store 依賴）──
const useStoreA = defineStore('storeA', () => {
  const shared = ref(1)
  return { shared }
})

const useStoreB = defineStore('storeB', () => {
  const shared = ref(2)          // 與 storeA 同名 key，刻意製造碰撞條件
  const storeA = useStoreA()
  const combined = computed(() => storeA.shared + shared.value)
  return { shared, combined }
})

// ── 主測試元件（對應 TEST_PLAN.md Phase 2）────────────────────────────────
const TestComp = defineComponent({
  name: 'TestComp',
  setup() {
    const testStore = useTestStore()
    const { count, items, double } = storeToRefs(testStore)
    const fromRef      = computed(() => count.value * 2)   // 讀 store ref
    const fromReactive = computed(() => items.value)       // 讀 store reactive
    const fromComputed = computed(() => double.value + 1)  // 讀 store computed getter
    watch(count, () => {})                                 // w_0：watch store ref
    return { testStore, count, items, double, fromRef, fromReactive, fromComputed }
  },
  render() { return h('div') },
})

// ── Helper ────────────────────────────────────────────────────────────────
function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('Phase 2 — Pinia Store 追蹤', () => {
  it('建立正確數量的節點並連線 deps / subs', () => {
    const graph = runWalker(TestComp, [createPinia()])

    const compNodes = getComponentNodes(graph, 'TestComp')
    const storeNodes = graph.stores['test']

    expect(compNodes).toBeDefined()
    expect(storeNodes).toBeDefined()
    // 7 component nodes（storeToRefs wrappers + computed + watch）
    expect(compNodes).toHaveLength(7)
    // 3 store nodes（test.count / test.items / test.double）
    expect(storeNodes).toHaveLength(3)

    const getComp = (varName: string) => compNodes.find(n => n.varName === varName)!
    // watch 節點 varName 統一為 'watch'，改用 id 查找
    const getCompById = (idSuffix: string) => compNodes.find(n => n.id === makeId(graph, 'TestComp', idSuffix))!

    // storeToRefs ref wrapper：count
    // ref 透過 auto-unwrap 觸發兩次 onTrack，storeValToComponentNode 正確攔截
    // expect(pick(getComp('count'))).toStrictEqual({
    //   id: makeId(graph, 'TestComp', 'count'),
    //   varName: 'count',
    //   type: 'ref',
    //   deps: ['test.count'],
    //   subs: [makeId(graph, 'TestComp', 'fromRef'), makeId(graph, 'TestComp', 'w_0')],
    // })

    // storeToRefs reactive wrapper：items
    // Phase 1 靜態建立 deps，subscriber 因 reactive 不會 auto-unwrap 而無法追蹤 items
    expect(pick(getComp('items'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'items'),
      varName: 'items',
      type: 'ref',
      deps: ['test.items'],
      subs: [makeId(graph, 'TestComp', 'fromReactive')],
    })

    // storeToRefs computed wrapper：double
    // wrapper 的 getter 走 store proxy → 觸發 store computed 的 onTrack → deps / subs 正確連線
    expect(pick(getComp('double'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'double'),
      varName: 'double',
      type: 'computed',
      deps: ['test.double'],
      subs: [makeId(graph, 'TestComp', 'fromComputed')],
    })

    // computed：fromRef（讀 storeToRefs ref）
    expect(pick(getComp('fromRef'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'fromRef'),
      varName: 'fromRef',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'count')],
      subs: [],
    })

    // computed：fromReactive（讀 storeToRefs reactive）
    // items（ObjectRefImpl）觸發 trackRefValue → onTrack → valNodeMap.get(items) → TestComp.items 節點
    expect(pick(getComp('fromReactive'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'fromReactive'),
      varName: 'fromReactive',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'items')],
      subs: [],
    })

    // computed：fromComputed（讀 storeToRefs computed wrapper）
    expect(pick(getComp('fromComputed'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'fromComputed'),
      varName: 'fromComputed',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'double')],
      subs: [],
    })

    // watch：w_0（監聽 storeToRefs ref）
    expect(pick(getCompById('w_0'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'w_0'),
      varName: 'watch',
      type: 'watch',
      deps: [makeId(graph, 'TestComp', 'count')],
      subs: [],
    })
  })

  it('store 節點的 subs 正確指向 component wrapper 節點', () => {
    const graph = runWalker(TestComp, [createPinia()])
    const storeNodes = graph.stores['test']

    expect(storeNodes).toBeDefined()

    const getStore = (varName: string) => storeNodes.find(n => n.varName === varName)!

    // ref：Phase 1 靜態建立連結
    expect(getStore('count').type).toBe('store')
    expect(getStore('count').subtype).toBe('ref')
    expect(getStore('count').subs).toContain(makeId(graph, 'TestComp', 'count'))
    expect(getStore('count').subs).toContain('test.double')  // Phase 2：store getter 訂閱
    // reactive：Phase 1 靜態建立連結
    expect(getStore('items').type).toBe('store')
    expect(getStore('items').subtype).toBe('reactive')
    expect(getStore('items').subs).toStrictEqual([makeId(graph, 'TestComp', 'items')])
    // computed（store getter）
    expect(getStore('double').type).toBe('store')
    expect(getStore('double').subtype).toBe('computed')
    expect(getStore('double').deps).toStrictEqual(['test.count'])
    expect(getStore('double').subs).toStrictEqual([makeId(graph, 'TestComp', 'double')])
  })

  it('market store getter 依賴多個 state 與條件分支（情境 A：預設分支）', () => {
    const MarketComp = defineComponent({
      name: 'MarketComp',
      setup() {
        const marketStore = useMarketStore()
        return { marketStore }
      },
      render() { return h('div') },
    })
    const graph = runWalker(MarketComp, [createPinia()])
    const storeNodes = graph.stores['market']

    expect(storeNodes).toBeDefined()

    const getStore = (varName: string) => storeNodes.find(n => n.varName === varName)!

    // 預設狀態下，getter 讀了條件判斷與 markets 分支
    expect(getStore('filteredMarkets').type).toBe('store')
    expect(getStore('filteredMarkets').subtype).toBe('computed')
    expect(getStore('filteredMarkets').deps).toContain('market.activeCategoryCode')
    expect(getStore('filteredMarkets').deps).toContain('market.markets')
    expect(getStore('filteredMarkets').deps).toHaveLength(2)

    // 上游 state 的 subs 包含 filteredMarkets
    expect(getStore('activeCategoryCode').subs).toContain('market.filteredMarkets')
    expect(getStore('markets').subs).toContain('market.filteredMarkets')
  })

  it('market store getter 依賴多個 state 與條件分支（情境 B：另一分支）', () => {
    const MarketComp = defineComponent({
      name: 'MarketComp',
      setup() {
        const marketStore = useMarketStore()
        // 先設定為 favorites 狀態再掃描
        marketStore.activeCategoryCode = 'favorites'
        return { marketStore }
      },
      render() { return h('div') },
    })
    const graph = runWalker(MarketComp, [createPinia()])
    const storeNodes = graph.stores['market']

    expect(storeNodes).toBeDefined()

    const getStore = (varName: string) => storeNodes.find(n => n.varName === varName)!

    // favorites 狀態下，getter 讀了 favoriteMarkets，但它是私有的 ref（未 return）
    // 因此只有 activeCategoryCode 在 deps，favoriteMarkets 的 dep 靜默略過
    expect(getStore('filteredMarkets').type).toBe('store')
    expect(getStore('filteredMarkets').subtype).toBe('computed')
    expect(getStore('filteredMarkets').deps).toStrictEqual(['market.activeCategoryCode'])

    // 不應有任何節點對應 favoriteMarkets（它從未被 collectPiniaState 登記）
    expect(storeNodes.find(n => n.varName === 'favoriteMarkets')).toBeUndefined()
  })

  it('跨 store 同名 key regression：deps 恰好為正確的兩筆，無誤連結', () => {
    const CrossStoreComp = defineComponent({
      name: 'CrossStoreComp',
      setup() {
        useStoreA()
        const storeB = useStoreB()
        return { storeB }
      },
      render() { return h('div') },
    })
    const graph = runWalker(CrossStoreComp, [createPinia()])
    const storeBNodes = graph.stores['storeB']

    expect(storeBNodes).toBeDefined()

    const getCombined = () => storeBNodes.find(n => n.varName === 'combined')!

    // combined getter 依賴 storeA.shared 與 storeB.shared
    // 由於 rawSetupState: {} 的修正，不會誤把 storeB.shared 自己當成跨 store 依賴
    expect(getCombined().type).toBe('store')
    expect(getCombined().subtype).toBe('computed')
    expect(getCombined().deps).toHaveLength(2)
    expect(getCombined().deps).toContain('storeA.shared')
    expect(getCombined().deps).toContain('storeB.shared')
  })
})
