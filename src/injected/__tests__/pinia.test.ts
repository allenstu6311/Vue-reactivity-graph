// Phase 2 — Pinia Store 追蹤
// 測試 store 的 ref / reactive / computed 透過 storeToRefs 解構後，deps / subs 連線正確
// 驗收標準見 TEST_PLAN.md Phase 2
import { describe, it, expect } from 'vitest'
import { defineComponent, computed, watch, h } from 'vue'
import { defineStore, storeToRefs, createPinia } from 'pinia'
import { ref, reactive } from 'vue'
import { runWalker } from './test-utils'
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
    const nodes = graph['TestComp']
    expect(nodes).toBeDefined()
    // 3 store nodes（test.count / test.items / test.double）+ 7 component nodes
    expect(nodes).toHaveLength(10)

    const get = (id: string) => nodes.find(n => n.id === id)!

    // storeToRefs ref wrapper：count
    // ref 透過 auto-unwrap 觸發兩次 onTrack，storeValToComponentNode 正確攔截
    // expect(pick(get('TestComp.count'))).toStrictEqual({
    //   id: 'TestComp.count',
    //   varName: 'count',
    //   type: 'ref',
    //   deps: ['test.count'],
    //   subs: ['TestComp.fromRef', 'TestComp.w_0'],
    // })

    // storeToRefs reactive wrapper：items
    // Phase 1 靜態建立 deps，subscriber 因 reactive 不會 auto-unwrap 而無法追蹤 items
    expect(pick(get('TestComp.items'))).toStrictEqual({
      id: 'TestComp.items',
      varName: 'items',
      type: 'ref',
      deps: ['test.items'],
      subs: ['TestComp.fromReactive'],
    })

    // storeToRefs computed wrapper：double
    // wrapper 的 getter 走 store proxy → 觸發 store computed 的 onTrack → deps / subs 正確連線
    expect(pick(get('TestComp.double'))).toStrictEqual({
      id: 'TestComp.double',
      varName: 'double',
      type: 'computed',
      deps: ['test.double'],
      subs: ['TestComp.fromComputed'],
    })

    // computed：fromRef（讀 storeToRefs ref）
    expect(pick(get('TestComp.fromRef'))).toStrictEqual({
      id: 'TestComp.fromRef',
      varName: 'fromRef',
      type: 'computed',
      deps: ['TestComp.count'],
      subs: [],
    })

    // computed：fromReactive（讀 storeToRefs reactive）
    // items（ObjectRefImpl）觸發 trackRefValue → onTrack → valNodeMap.get(items) → TestComp.items 節點
    expect(pick(get('TestComp.fromReactive'))).toStrictEqual({
      id: 'TestComp.fromReactive',
      varName: 'fromReactive',
      type: 'computed',
      deps: ['TestComp.items'],
      subs: [],
    })

    // computed：fromComputed（讀 storeToRefs computed wrapper）
    expect(pick(get('TestComp.fromComputed'))).toStrictEqual({
      id: 'TestComp.fromComputed',
      varName: 'fromComputed',
      type: 'computed',
      deps: ['TestComp.double'],
      subs: [],
    })

    // watch：w_0（監聽 storeToRefs ref）
    expect(pick(get('TestComp.w_0'))).toStrictEqual({
      id: 'TestComp.w_0',
      varName: 'w_0',
      type: 'watch',
      deps: ['TestComp.count'],
      subs: [],
    })
  })

  it('store 節點的 subs 正確指向 component wrapper 節點', () => {
    const graph = runWalker(TestComp, [createPinia()])
    // store nodes 與 component nodes 同屬 graph['TestComp']
    const nodes = graph['TestComp']
    expect(nodes).toBeDefined()

    const get = (id: string) => nodes.find(n => n.id === id)!

    // ref：Phase 1 靜態建立連結
    expect(get('test.count').subs).toStrictEqual(['TestComp.count'])
    // reactive：Phase 1 靜態建立連結
    expect(get('test.items').subs).toStrictEqual(['TestComp.items'])
    expect(get('test.double').subs).toStrictEqual(['TestComp.double'])
  })
})
