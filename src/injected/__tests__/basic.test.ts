// Phase 1 — 單一元件基礎驗證
// 測試 ref / reactive / computed / watch 節點建立與 deps / subs 連線
// 驗收標準見 TEST_PLAN.md Phase 1
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, reactive, computed, watch, h } from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
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
    const nodes = getComponentNodes(graph, 'TestComp')
    expect(nodes).toBeDefined()
    // 節點數量：count (ref) + items (reactive) + double (computed) + label (computed) + listLen (computed) + w_0 (watch) + w_1 (watch) = 7
    expect(nodes).toHaveLength(7)

    const get = (varName: string) => nodes.find(n => n.varName === varName)!
    // watch 節點 varName 統一為 'watch'，無法用 varName 區分，改用 id 查找
    const getById = (idSuffix: string) => nodes.find(n => n.id === makeId(graph, 'TestComp', idSuffix))!

    // ref: count
    expect(pick(get('count'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'count'),
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'TestComp', 'double'), makeId(graph, 'TestComp', 'w_0')],
    })

    // reactive: items
    expect(pick(get('items'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'items'),
      varName: 'items',
      type: 'reactive',
      deps: [],
      subs: [makeId(graph, 'TestComp', 'listLen')],
    })

    // computed: double（讀 ref）
    expect(pick(get('double'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'double'),
      varName: 'double',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'count')],
      subs: [makeId(graph, 'TestComp', 'label'), makeId(graph, 'TestComp', 'w_1')],
    })

    // computed: label（讀 computed — chain）
    expect(pick(get('label'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'label'),
      varName: 'label',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'double')],
      subs: [],
    })

    // computed: listLen（讀 reactive）
    expect(pick(get('listLen'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'listLen'),
      varName: 'listLen',
      type: 'computed',
      deps: [makeId(graph, 'TestComp', 'items')],
      subs: [],
    })

    // watch: w_0（監聽 ref）
    expect(pick(getById('w_0'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'w_0'),
      varName: 'watch',
      type: 'watch',
      deps: [makeId(graph, 'TestComp', 'count')],
      subs: [],
    })

    // watch: w_1（監聽 computed）
    expect(pick(getById('w_1'))).toStrictEqual({
      id: makeId(graph, 'TestComp', 'w_1'),
      varName: 'watch',
      type: 'watch',
      deps: [makeId(graph, 'TestComp', 'double')],
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
    const nodes = getComponentNodes(graph, 'DupComp')
    const sumTwice = nodes.find(n => n.varName === 'sumTwice')!

    expect(sumTwice.deps).toStrictEqual([makeId(graph, 'DupComp', 'count')])
    expect(nodes.find(n => n.varName === 'count')!.subs).toStrictEqual([makeId(graph, 'DupComp', 'sumTwice')])
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
    const nodes = getComponentNodes(graph, 'UnusedComp')
    const unused = nodes.find(n => n.varName === 'unused')!

    expect(unused).toBeDefined()
    expect(unused.subs).toStrictEqual([])
  })
})
