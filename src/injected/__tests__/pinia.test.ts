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
    // 8 component nodes（sentinel + storeToRefs wrappers + computed + watch）
    expect(compNodes).toHaveLength(8)
    // 3 store nodes（test.count / test.items / test.double）
    expect(storeNodes).toHaveLength(3)

    const getComp = (varName: string) => compNodes.find(n => n.varName === varName)!

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
    expect(pick(getComp('w_0'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'w_0'),
      varName: 'w_0',
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
    expect(getStore('count').subs).toStrictEqual([makeId(graph, 'TestComp', 'count')])
    // reactive：Phase 1 靜態建立連結
    expect(getStore('items').subs).toStrictEqual([makeId(graph, 'TestComp', 'items')])
    expect(getStore('double').subs).toStrictEqual([makeId(graph, 'TestComp', 'double')])
  })
})
