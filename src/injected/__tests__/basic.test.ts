// Phase 1 — 單一元件基礎驗證
// 測試 ref / reactive / computed / watch 節點建立與 deps / subs 連線
// 驗收標準見 TEST_PLAN.md Phase 1
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, reactive, computed, watch, h } from 'vue'
import { runWalker } from './test-utils'
import type { GraphNode } from '../../graph'

// ── 主測試元件（對應 TEST_PLAN.md Phase 1）────────────────────────────────
// items 使用單層屬性存取，避免巢狀 reactive 多次觸發 onTrack（e.g. items.list.length 會額外追蹤 'length'）
const TestComp = defineComponent({
  name: 'TestComp',
  setup() {
    const count = ref(0)
    const items = reactive({ count: 0 })
    const double = computed(() => count.value * 2)           // 讀 ref
    const label = computed(() => `${double.value} items`)   // 讀 computed（chain）
    const listLen = computed(() => items.count)             // 讀 reactive
    watch(count, () => {})                                  // w_0：監聽 ref
    watch(double, () => {})                                 // w_1：監聽 computed
    return { count, items, double, label, listLen }
  },
  render() { return h('div') },
})

// ── Helper ────────────────────────────────────────────────────────────────
function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('Phase 1 — 單一元件基礎驗證', () => {
  it('建立正確數量的節點並連線 deps / subs', () => {
    const graph = runWalker(TestComp)
    const nodes = graph['TestComp']
    expect(nodes).toBeDefined()
    expect(nodes).toHaveLength(7)

    const get = (varName: string) => nodes.find(n => n.varName === varName)!

    // ref: count
    expect(pick(get('count'))).toStrictEqual({
      id: 'TestComp.count',
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: ['TestComp.double', 'TestComp.w_0'],
    })

    // reactive: items
    expect(pick(get('items'))).toStrictEqual({
      id: 'TestComp.items',
      varName: 'items',
      type: 'reactive',
      deps: [],
      subs: ['TestComp.listLen'],
    })

    // computed: double（讀 ref）
    expect(pick(get('double'))).toStrictEqual({
      id: 'TestComp.double',
      varName: 'double',
      type: 'computed',
      deps: ['TestComp.count'],
      subs: ['TestComp.label', 'TestComp.w_1'],
    })

    // computed: label（讀 computed — chain）
    expect(pick(get('label'))).toStrictEqual({
      id: 'TestComp.label',
      varName: 'label',
      type: 'computed',
      deps: ['TestComp.double'],
      subs: [],
    })

    // computed: listLen（讀 reactive）
    expect(pick(get('listLen'))).toStrictEqual({
      id: 'TestComp.listLen',
      varName: 'listLen',
      type: 'computed',
      deps: ['TestComp.items'],
      subs: [],
    })

    // watch: w_0（監聽 ref）
    expect(pick(get('w_0'))).toStrictEqual({
      id: 'TestComp.w_0',
      varName: 'w_0',
      type: 'watch',
      deps: ['TestComp.count'],
      subs: [],
    })

    // watch: w_1（監聽 computed）
    expect(pick(get('w_1'))).toStrictEqual({
      id: 'TestComp.w_1',
      varName: 'w_1',
      type: 'watch',
      deps: ['TestComp.double'],
      subs: [],
    })
  })

  it('同一 source 被多次讀取時，deps 不重複紀錄', () => {
    const DupComp = defineComponent({
      name: 'DupComp',
      setup() {
        const count = ref(0)
        const sumTwice = computed(() => count.value + count.value)
        return { count, sumTwice }
      },
      render() { return h('div') },
    })

    const graph = runWalker(DupComp)
    const sumTwice = graph['DupComp'].find(n => n.varName === 'sumTwice')!

    expect(sumTwice.deps).toStrictEqual(['DupComp.count'])
    expect(graph['DupComp'].find(n => n.varName === 'count')!.subs).toStrictEqual(['DupComp.sumTwice'])
  })

  it('無訂閱者的 ref，subs 為空陣列', () => {
    const UnusedComp = defineComponent({
      name: 'UnusedComp',
      setup() {
        const unused = ref(0)
        return { unused }
      },
      render() { return h('div') },
    })

    const graph = runWalker(UnusedComp)
    const unused = graph['UnusedComp'].find(n => n.varName === 'unused')!

    expect(unused).toBeDefined()
    expect(unused.subs).toStrictEqual([])
  })
})
