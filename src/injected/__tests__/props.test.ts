// Phase 3 — Props 基礎傳遞
// 測試子元件 prop 節點連回父層 source node（ref / computed）
// 測試同一 component 使用兩次時的命名去重（ChildComp / ChildComp_1）
// 驗收標準見 TEST_PLAN.md Phase 3
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, computed, h } from '@vue/runtime-core'
import { runWalker } from './test-utils'
import type { GraphNode } from '../../graph'

function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── 同名 prop ──────────────────────────────────────────────────────────────
const SameNameChild = defineComponent({
  name: 'SameNameChild',
  props: { count: Number },
  render() { return h('div') },
})

const SameNameParent = defineComponent({
  name: 'SameNameParent',
  setup() {
    const count = ref(5)
    return { count }
  },
  render() { return h(SameNameChild, { count: (this as any).count }) },
})

// ── 異名 prop（sentinel dry-run）──────────────────────────────────────────
const RenamedChild = defineComponent({
  name: 'RenamedChild',
  props: { value: Number },
  render() { return h('div') },
})

const RenamedParent = defineComponent({
  name: 'RenamedParent',
  setup() {
    const count = ref(10)
    return { count }
  },
  render() { return h(RenamedChild, { value: (this as any).count }) },
})

// ── computed → prop ────────────────────────────────────────────────────────
const ComputedChild = defineComponent({
  name: 'ComputedChild',
  props: { total: Number },
  render() { return h('div') },
})

const ComputedParent = defineComponent({
  name: 'ComputedParent',
  setup() {
    const price = ref(100)
    const qty = ref(3)
    const total = computed(() => price.value * qty.value)
    return { price, qty, total }
  },
  render() { return h(ComputedChild, { total: (this as any).total }) },
})

// ── 同名 component 多實例去重 ──────────────────────────────────────────────
const DupChild = defineComponent({
  name: 'DupChild',
  props: { val: Number },
  render() { return h('div') },
})

const DupParent = defineComponent({
  name: 'DupParent',
  setup() {
    const a = ref(1)
    const b = ref(2)
    return { a, b }
  },
  render() {
    return h('div', [
      h(DupChild, { val: (this as any).a }),
      h(DupChild, { val: (this as any).b }),
    ])
  },
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Phase 3 — Props 基礎傳遞', () => {
  it('ref → prop（同名）：prop node 連回父層 ref', () => {
    const graph = runWalker(SameNameParent)
    const parent = graph['SameNameParent']
    const child = graph['SameNameParent.SameNameChild']

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentCount = parent.find(n => n.varName === 'count')!
    const childCount = child.find(n => n.varName === 'count')!

    expect(pick(parentCount)).toStrictEqual({
      id: 'SameNameParent.count',
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: ['SameNameParent.SameNameChild.count'],
    })

    expect(pick(childCount)).toStrictEqual({
      id: 'SameNameParent.SameNameChild.count',
      varName: 'count',
      type: 'prop',
      deps: ['SameNameParent.count'],
      subs: [],
    })
  })

  it('ref → prop（異名）：prop node 連回父層 ref（sentinel dry-run）', () => {
    const graph = runWalker(RenamedParent)
    const parent = graph['RenamedParent']
    const child = graph['RenamedParent.RenamedChild']

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentCount = parent.find(n => n.varName === 'count')!
    const childValue = child.find(n => n.varName === 'value')!

    expect(pick(parentCount)).toStrictEqual({
      id: 'RenamedParent.count',
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: ['RenamedParent.RenamedChild.value'],
    })

    expect(pick(childValue)).toStrictEqual({
      id: 'RenamedParent.RenamedChild.value',
      varName: 'value',
      type: 'prop',
      deps: ['RenamedParent.count'],
      subs: [],
    })
  })

  it('computed → prop：prop node 連回父層 computed', () => {
    const graph = runWalker(ComputedParent)
    const parent = graph['ComputedParent']
    const child = graph['ComputedParent.ComputedChild']

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentTotal = parent.find(n => n.varName === 'total')!
    const childTotal = child.find(n => n.varName === 'total')!

    expect(pick(parentTotal)).toStrictEqual({
      id: 'ComputedParent.total',
      varName: 'total',
      type: 'computed',
      deps: ['ComputedParent.price', 'ComputedParent.qty'],
      subs: ['ComputedParent.ComputedChild.total'],
    })

    expect(pick(childTotal)).toStrictEqual({
      id: 'ComputedParent.ComputedChild.total',
      varName: 'total',
      type: 'prop',
      deps: ['ComputedParent.total'],
      subs: [],
    })
  })

  // ── 已知限制：Prop → Prop 轉傳 ──────────────────────────────────────────
  // GrandParent(ref) → Parent(prop) → Child(prop)
  // 第二層 prop→prop 預期失敗：Parent 的 count 在 instance.props，不在 setupState，
  // sentinel dry-run 的 getOwnPropertyDescriptor fallthrough 讓 sentinel 攔不到
  it('prop → prop 轉傳：第二層 prop node 無法連回父層 prop（已知限制）', () => {
    const PropChild = defineComponent({
      name: 'PropChild',
      props: { value: Number },
      render() { return h('div') },
    })
    const PropParent = defineComponent({
      name: 'PropParent',
      props: { count: Number },
      render() { return h(PropChild, { value: (this as any).count }) },
    })
    const PropGrandParent = defineComponent({
      name: 'PropGrandParent',
      setup() {
        const count = ref(42)
        return { count }
      },
      render() { return h(PropParent, { count: (this as any).count }) },
    })

    const graph = runWalker(PropGrandParent)

    // 第一層（ref → prop）：sentinel 覆蓋 setupState，能追蹤 ✓
    const parentCount = graph['PropGrandParent.PropParent']?.find(n => n.varName === 'count')!
    expect(parentCount.deps).toStrictEqual(['PropGrandParent.count'])

    // 第二層（prop → prop）：PropParent.count 在 instance.props，不在 setupState
    // hasOwnProperty(sentinelProxy, 'count') = false → component proxy fallthrough 到真實 props
    // sentinel 攔不到 → childValue.deps 實際為 []，以下斷言會失敗
    const childValue = graph['PropGrandParent.PropParent.PropChild']?.find(n => n.varName === 'value')!
    expect(pick(childValue)).toStrictEqual({
      id: 'PropGrandParent.PropParent.PropChild.value',
      varName: 'value',
      type: 'prop',
      deps: ['PropGrandParent.PropParent.count'],
      subs: [],
    })
  })

  it('同名 component 使用兩次時命名去重，prop 各自連回正確的父層 ref', () => {
    const graph = runWalker(DupParent)
    const parent = graph['DupParent']
    const child0 = graph['DupParent.DupChild']
    const child1 = graph['DupParent.DupChild_1']

    expect(child0).toBeDefined()
    expect(child1).toBeDefined()

    const parentA = parent.find(n => n.varName === 'a')!
    const parentB = parent.find(n => n.varName === 'b')!
    const childVal0 = child0.find(n => n.varName === 'val')!
    const childVal1 = child1.find(n => n.varName === 'val')!

    expect(pick(parentA)).toStrictEqual({
      id: 'DupParent.a',
      varName: 'a',
      type: 'ref',
      deps: [],
      subs: ['DupParent.DupChild.val'],
    })

    expect(pick(parentB)).toStrictEqual({
      id: 'DupParent.b',
      varName: 'b',
      type: 'ref',
      deps: [],
      subs: ['DupParent.DupChild_1.val'],
    })

    expect(pick(childVal0)).toStrictEqual({
      id: 'DupParent.DupChild.val',
      varName: 'val',
      type: 'prop',
      deps: ['DupParent.a'],
      subs: [],
    })

    expect(pick(childVal1)).toStrictEqual({
      id: 'DupParent.DupChild_1.val',
      varName: 'val',
      type: 'prop',
      deps: ['DupParent.b'],
      subs: [],
    })
  })
})
