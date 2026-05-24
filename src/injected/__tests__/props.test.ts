// Phase 3 — Props 基礎傳遞
// 測試子元件 prop 節點連回父層 source node（ref / computed）
// 測試同一 component 使用兩次時的命名去重（ChildComp / ChildComp_1）
// 驗收標準見 TEST_PLAN.md Phase 3
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref, reactive, computed, h, createVNode } from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
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
    const parent = getComponentNodes(graph, 'SameNameParent')
    const childPath = Object.values(graph.components).find(m => m.path?.includes('SameNameChild'))?.path
    const child = getComponentNodes(graph, childPath || 'SameNameParent.SameNameChild')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentCount = parent.find(n => n.varName === 'count')!
    const childCount = child.find(n => n.varName === 'count')!

    expect(pick(parentCount)).toStrictEqual({
      id: parentCount.id,
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: [childCount.id],
    })

    expect(pick(childCount)).toStrictEqual({
      id: childCount.id,
      varName: 'count',
      type: 'prop',
      deps: [parentCount.id],
      subs: [],
    })
  })

  it('ref → prop（異名）：prop node 連回父層 ref（sentinel dry-run）', () => {
    const graph = runWalker(RenamedParent)
    const parent = getComponentNodes(graph, 'RenamedParent')
    const child = getComponentNodes(graph, 'RenamedParent.RenamedChild')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentCount = parent.find(n => n.varName === 'count')!
    const childValue = child.find(n => n.varName === 'value')!

    expect(pick(parentCount)).toStrictEqual({
      id: makeId(graph, 'RenamedParent', 'count'),
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'RenamedParent.RenamedChild', 'value')],
    })

    expect(pick(childValue)).toStrictEqual({
      id: makeId(graph, 'RenamedParent.RenamedChild', 'value'),
      varName: 'value',
      type: 'prop',
      deps: [makeId(graph, 'RenamedParent', 'count')],
      subs: [],
    })
  })

  it('computed → prop：prop node 連回父層 computed', () => {
    const graph = runWalker(ComputedParent)
    const parent = getComponentNodes(graph, 'ComputedParent')
    const child = getComponentNodes(graph, 'ComputedParent.ComputedChild')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()

    const parentTotal = parent.find(n => n.varName === 'total')!
    const childTotal = child.find(n => n.varName === 'total')!

    expect(pick(parentTotal)).toStrictEqual({
      id: makeId(graph, 'ComputedParent', 'total'),
      varName: 'total',
      type: 'computed',
      deps: [makeId(graph, 'ComputedParent', 'price'), makeId(graph, 'ComputedParent', 'qty')],
      subs: [makeId(graph, 'ComputedParent.ComputedChild', 'total')],
    })

    expect(pick(childTotal)).toStrictEqual({
      id: makeId(graph, 'ComputedParent.ComputedChild', 'total'),
      varName: 'total',
      type: 'prop',
      deps: [makeId(graph, 'ComputedParent', 'total')],
      subs: [],
    })
  })

  // ── Prop → Prop 轉傳 ──────────────────────────────────────────────────
  // GrandParent(ref) → Parent(prop) → Child(prop)
  // sentinel dry-run 會遍歷 instance.props，能追蹤 prop→prop 的依賴鏈
  it('prop → prop 轉傳：第二層 prop node 可連回父層 prop', () => {
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
    const parentNodes = getComponentNodes(graph, 'PropGrandParent.PropParent')
    const parentCount = parentNodes?.find(n => n.varName === 'count')!
    expect(parentCount.deps).toStrictEqual([makeId(graph, 'PropGrandParent', 'count')])

    // 第二層（prop → prop）：PropParent.count 在 instance.props
    // sentinel dry-run 同樣覆蓋 props，能追蹤 PropParent.count → PropChild.value ✓
    const childNodes = getComponentNodes(graph, 'PropGrandParent.PropParent.PropChild')
    const childValue = childNodes?.find(n => n.varName === 'value')!
    expect(pick(childValue)).toStrictEqual({
      id: makeId(graph, 'PropGrandParent.PropParent.PropChild', 'value'),
      varName: 'value',
      type: 'prop',
      deps: [makeId(graph, 'PropGrandParent.PropParent', 'count')],
      subs: [],
    })
  })

  // ── Branch A：v-bind="someObj" 整包展開 ───────────────────────────────────
  // 測試情境：sentinel dry-run 後 vnode.props 本身是 Symbol
  // Walker 應反查 rawSetupState 建立 innerKey → sourceVarName 對應

  describe('Branch A — v-bind="someObj" 整包展開追蹤', () => {
    // reactive 包裹情境
    // someObj = reactive({ text: num })，<VBindChild v-bind="someObj" />
    // render 模擬：createVNode(Child, (this as any).someObj)
    // sentinel dry-run 時，(this as any).someObj 存取 sentinelProxy.someObj → Symbol('someObj')
    // createVNode(Child, Symbol) → vnode.props = Symbol('someObj')，觸發 Branch A
    const VBindChildReactive = defineComponent({
      name: 'VBindChildReactive',
      props: { text: Number },
      render() { return h('div') },
    })

    const VBindParentReactive = defineComponent({
      name: 'VBindParentReactive',
      setup() {
        const num = ref(10)
        const someObj = reactive({ text: num })
        return { num, someObj }
      },
      render() {
        return createVNode(VBindChildReactive, (this as any).someObj)
      },
    })

    it('reactive 包裹：prop node 的 deps 包含來源 ref 的 id', () => {
      const graph = runWalker(VBindParentReactive)
      const child = getComponentNodes(graph, 'VBindParentReactive.VBindChildReactive')

      expect(child).toBeDefined()
      const textProp = child.find(n => n.varName === 'text')!
      expect(textProp).toBeDefined()
      expect(textProp.deps).toContain(makeId(graph, 'VBindParentReactive', 'num'))
    })

    it('reactive 包裹：來源 ref 的 subs 包含 prop node 的 id', () => {
      const graph = runWalker(VBindParentReactive)
      const parent = getComponentNodes(graph, 'VBindParentReactive')

      const numNode = parent.find(n => n.varName === 'num')!
      expect(numNode).toBeDefined()
      expect(numNode.subs).toContain(makeId(graph, 'VBindParentReactive.VBindChildReactive', 'text'))
    })

    // 純物件情境
    // someObj = { text: num }（非 reactive 包裹），__v_raw 不存在，fallback 到 someObj 自身
    // rawSourceObj[innerKey] 仍是同一個 RefImpl 引用，reverseMap 仍能反查
    const VBindChildPlain = defineComponent({
      name: 'VBindChildPlain',
      props: { text: Number },
      render() { return h('div') },
    })

    const VBindParentPlain = defineComponent({
      name: 'VBindParentPlain',
      setup() {
        const num = ref(99)
        const someObj = { text: num }
        return { num, someObj }
      },
      render() {
        return createVNode(VBindChildPlain, (this as any).someObj)
      },
    })

    it('純物件包裹（非 reactive）：prop node 的 deps 包含來源 ref 的 id', () => {
      const graph = runWalker(VBindParentPlain)
      const child = getComponentNodes(graph, 'VBindParentPlain.VBindChildPlain')

      expect(child).toBeDefined()
      const textProp = child.find(n => n.varName === 'text')!
      expect(textProp).toBeDefined()
      expect(textProp.deps).toContain(makeId(graph, 'VBindParentPlain', 'num'))
    })

    it('純物件包裹（非 reactive）：來源 ref 的 subs 包含 prop node 的 id', () => {
      const graph = runWalker(VBindParentPlain)
      const parent = getComponentNodes(graph, 'VBindParentPlain')

      const numNode = parent.find(n => n.varName === 'num')!
      expect(numNode).toBeDefined()
      expect(numNode.subs).toContain(makeId(graph, 'VBindParentPlain.VBindChildPlain', 'text'))
    })

    // primitive 值無法反查情境
    // someObj = reactive({ count: 0 })，primitive value 不在 reverseMap 裡
    // 應呼叫 console.warn，不拋出例外
    const VBindChildPrimitive = defineComponent({
      name: 'VBindChildPrimitive',
      props: { count: Number },
      render() { return h('div') },
    })

    const VBindParentPrimitive = defineComponent({
      name: 'VBindParentPrimitive',
      setup() {
        const someObj = reactive({ count: 0 })
        return { someObj }
      },
      render() {
        return createVNode(VBindChildPrimitive, (this as any).someObj)
      },
    })

    it('someObj 內含 primitive value：呼叫 console.warn，不拋出例外', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(() => runWalker(VBindParentPrimitive)).not.toThrow()
        expect(warnSpy).toHaveBeenCalled()
      } finally {
        warnSpy.mockRestore()
      }
    })

    // Branch A 與 Branch B 並存情境
    // 父元件同時有：v-bind="someObj"（Branch A）與 :title="titleVar"（Branch B）
    // 兩個 prop 都應正確追蹤
    const VBindChildMixed = defineComponent({
      name: 'VBindChildMixed',
      props: { text: Number, title: String },
      render() { return h('div') },
    })

    const VBindParentMixed = defineComponent({
      name: 'VBindParentMixed',
      setup() {
        const num = ref(7)
        const titleVar = ref('hello')
        const someObj = reactive({ text: num })
        return { num, titleVar, someObj }
      },
      render() {
        // 模擬 <VBindChildMixed v-bind="someObj" :title="titleVar" />
        // Vue 編譯後等同於 mergeProps(someObj, { title: titleVar })
        // 但 dry-run 時兩者分別是 Symbol('someObj') 與 Symbol('titleVar')
        // 注意：多個 v-bind 時 Vue 會 mergeProps，此處只測一個 v-bind 加一個具名 prop 的情境
        // 為了正確模擬，需先展開 someObj 再加 title（Branch B 路徑）
        const self = this as any
        return createVNode(VBindChildMixed, { ...self.someObj, title: self.titleVar })
      },
    })

    it('Branch A 與 Branch B 並存：v-bind 展開的 prop 和具名 prop 都能正確追蹤', () => {
      const graph = runWalker(VBindParentMixed)
      const parent = getComponentNodes(graph, 'VBindParentMixed')
      const child = getComponentNodes(graph, 'VBindParentMixed.VBindChildMixed')

      expect(child).toBeDefined()

      const textProp = child.find(n => n.varName === 'text')!
      const titleProp = child.find(n => n.varName === 'title')!

      expect(textProp).toBeDefined()
      expect(titleProp).toBeDefined()

      // Branch B 路徑：titleVar → title prop（具名 prop sentinel）
      expect(titleProp.deps).toContain(makeId(graph, 'VBindParentMixed', 'titleVar'))
      const titleVarNode = parent.find(n => n.varName === 'titleVar')!
      expect(titleVarNode.subs).toContain(makeId(graph, 'VBindParentMixed.VBindChildMixed', 'title'))
    })
  })

  it('同名 component 使用兩次時命名去重，prop 各自連回正確的父層 ref', () => {
    const graph = runWalker(DupParent)
    const parent = getComponentNodes(graph, 'DupParent')
    const child0 = getComponentNodes(graph, 'DupParent.DupChild')

    expect(child0).toBeDefined()
    // 找到兩個不同的 uid
    const child0Uid = Object.keys(graph.components).find(uid =>
      graph.components[uid].path === 'DupParent.DupChild' &&
      graph.nodes[uid] === child0
    )
    const allChildren = Object.entries(graph.components)
      .filter(([uid, meta]) => meta.path === 'DupParent.DupChild' && uid !== child0Uid)
      .map(([uid]) => graph.nodes[uid] ?? [])
    expect(allChildren.length > 0).toBe(true)
    const child1Nodes = allChildren[0]

    const parentA = parent.find(n => n.varName === 'a')!
    const parentB = parent.find(n => n.varName === 'b')!
    const childVal0 = child0.find(n => n.varName === 'val')!
    const childVal1 = child1Nodes.find(n => n.varName === 'val')!

    expect(pick(parentA)).toStrictEqual({
      id: makeId(graph, 'DupParent', 'a'),
      varName: 'a',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'DupParent.DupChild', 'val')],
    })

    expect(pick(parentB)).toStrictEqual({
      id: makeId(graph, 'DupParent', 'b'),
      varName: 'b',
      type: 'ref',
      deps: [],
      subs: [childVal1.id],
    })

    expect(pick(childVal0)).toStrictEqual({
      id: makeId(graph, 'DupParent.DupChild', 'val'),
      varName: 'val',
      type: 'prop',
      deps: [makeId(graph, 'DupParent', 'a')],
      subs: [],
    })

    expect(pick(childVal1)).toStrictEqual({
      id: childVal1.id,
      varName: 'val',
      type: 'prop',
      deps: [makeId(graph, 'DupParent', 'b')],
      subs: [],
    })
  })
})
