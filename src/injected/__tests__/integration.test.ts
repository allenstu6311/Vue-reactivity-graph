// Phase 5 — 跨系統整合情境
// 測試 inject 值當 prop 傳入子元件（inject → prop）
// 測試 prop 經 computed 包裝後再傳入下一層（prop → computed → prop）
// 測試完整三層鏈：provide → inject → computed → prop
// 測試 Pinia storeToRefs ref 作為 prop source（Pinia → prop）
// 驗收標準見 spec.md
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, computed, provide, inject, h } from 'vue'
import { defineStore, storeToRefs, createPinia } from 'pinia'
import { runWalker, getComponentNodes, makeId } from './test-utils'
import type { GraphNode } from '../../graph'

function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── 情境 ① inject → prop ──────────────────────────────────────────────────

const InjPropChild = defineComponent({
  name: 'InjPropChild',
  props: { value: Number },
  render() { return h('div') },
})

const InjPropReceiver = defineComponent({
  name: 'InjPropReceiver',
  setup() {
    const num = inject('num', ref(0))
    return { num }
  },
  render() { return h(InjPropChild, { value: (this as any).num }) },
})

const InjPropProvider = defineComponent({
  name: 'InjPropProvider',
  setup() {
    const num = ref(42)
    provide('num', num)
    return { num }
  },
  render() { return h(InjPropReceiver) },
})

// ── 情境 ② prop → computed → prop ────────────────────────────────────────

const PcpChild = defineComponent({
  name: 'PcpChild',
  props: { value: Number },
  render() { return h('div') },
})

const PcpParent = defineComponent({
  name: 'PcpParent',
  props: { count: Number },
  setup(props) {
    const double = computed(() => (props.count ?? 0) * 2)
    return { double }
  },
  render() { return h(PcpChild, { value: (this as any).double }) },
})

const PcpGrandParent = defineComponent({
  name: 'PcpGrandParent',
  setup() {
    const count = ref(5)
    return { count }
  },
  render() { return h(PcpParent, { count: (this as any).count }) },
})

// ── 情境 ③ provide → inject → computed → prop（三層鏈）─────────────────

const ChainLeaf = defineComponent({
  name: 'ChainLeaf',
  props: { result: Number },
  render() { return h('div') },
})

const ChainMiddle = defineComponent({
  name: 'ChainMiddle',
  setup() {
    const base = inject('base', ref(0))
    const doubled = computed(() => base.value * 2)
    return { base, doubled }
  },
  render() { return h(ChainLeaf, { result: (this as any).doubled }) },
})

const ChainProvider = defineComponent({
  name: 'ChainProvider',
  setup() {
    const base = ref(10)
    provide('base', base)
    return { base }
  },
  render() { return h(ChainMiddle) },
})

// ── 情境 ④ Pinia store ref → prop ────────────────────────────────────────

const useIntegStore = defineStore('integration', () => {
  const count = ref(0)
  return { count }
})

const PiniaChild = defineComponent({
  name: 'PiniaChild',
  props: { value: Number },
  render() { return h('div') },
})

const PiniaParent = defineComponent({
  name: 'PiniaParent',
  setup() {
    const store = useIntegStore()
    const { count } = storeToRefs(store)
    return { store, count }
  },
  render() { return h(PiniaChild, { value: (this as any).count }) },
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Phase 5 — 跨系統整合情境', () => {
  describe('情境 ① inject → prop', () => {
    it('Child prop node.deps 指向 Receiver inject node id', () => {
      const graph = runWalker(InjPropProvider)
      const childValue = getComponentNodes(graph, 'InjPropProvider.InjPropReceiver.InjPropChild')
        .find(n => n.varName === 'value')!

      expect(pick(childValue)).toStrictEqual({
        id: makeId(graph, 'InjPropProvider.InjPropReceiver.InjPropChild', 'value'),
        varName: 'value',
        type: 'prop',
        deps: [makeId(graph, 'InjPropProvider.InjPropReceiver', 'num')],
        subs: [],
      })
    })

    it('Provider ref node.subs 包含 Receiver inject node id', () => {
      const graph = runWalker(InjPropProvider)
      const providerNum = getComponentNodes(graph, 'InjPropProvider').find(n => n.varName === 'num')!

      expect(pick(providerNum)).toStrictEqual({
        id: makeId(graph, 'InjPropProvider', 'num'),
        varName: 'num',
        type: 'ref',
        deps: [],
        subs: [makeId(graph, 'InjPropProvider.InjPropReceiver', 'num')],
      })
    })

    it('Receiver inject node.subs 包含 Child prop node id', () => {
      const graph = runWalker(InjPropProvider)
      const receiverNum = getComponentNodes(graph, 'InjPropProvider.InjPropReceiver')
        .find(n => n.varName === 'num')!

      expect(pick(receiverNum)).toStrictEqual({
        id: makeId(graph, 'InjPropProvider.InjPropReceiver', 'num'),
        varName: 'num',
        type: 'inject',
        deps: [makeId(graph, 'InjPropProvider', 'num')],
        subs: [makeId(graph, 'InjPropProvider.InjPropReceiver.InjPropChild', 'value')],
      })
    })
  })

  describe('情境 ② prop → computed → prop', () => {
    it('Child prop node.deps 指向 Parent computed node id', () => {
      const graph = runWalker(PcpGrandParent)
      const childValue = getComponentNodes(graph, 'PcpGrandParent.PcpParent.PcpChild')
        .find(n => n.varName === 'value')!

      expect(pick(childValue)).toStrictEqual({
        id: makeId(graph, 'PcpGrandParent.PcpParent.PcpChild', 'value'),
        varName: 'value',
        type: 'prop',
        deps: [makeId(graph, 'PcpGrandParent.PcpParent', 'double')],
        subs: [],
      })
    })

    it('Parent computed node.deps 包含 Parent prop node id，subs 包含 Child prop node id', () => {
      const graph = runWalker(PcpGrandParent)
      const parentDouble = getComponentNodes(graph, 'PcpGrandParent.PcpParent')
        .find(n => n.varName === 'double')!

      expect(pick(parentDouble)).toStrictEqual({
        id: makeId(graph, 'PcpGrandParent.PcpParent', 'double'),
        varName: 'double',
        type: 'computed',
        deps: [makeId(graph, 'PcpGrandParent.PcpParent', 'count')],
        subs: [makeId(graph, 'PcpGrandParent.PcpParent.PcpChild', 'value')],
      })
    })

    it('Parent prop node.subs 包含 Parent computed node id', () => {
      const graph = runWalker(PcpGrandParent)
      const parentCount = getComponentNodes(graph, 'PcpGrandParent.PcpParent')
        .find(n => n.varName === 'count')!

      expect(pick(parentCount)).toStrictEqual({
        id: makeId(graph, 'PcpGrandParent.PcpParent', 'count'),
        varName: 'count',
        type: 'prop',
        deps: [makeId(graph, 'PcpGrandParent', 'count')],
        subs: [makeId(graph, 'PcpGrandParent.PcpParent', 'double')],
      })
    })
  })

  describe('情境 ③ provide → inject → computed → prop（三層鏈）', () => {
    it('Provider ref → inject node 互連', () => {
      const graph = runWalker(ChainProvider)
      const providerBase = getComponentNodes(graph, 'ChainProvider').find(n => n.varName === 'base')!
      const middleBase = getComponentNodes(graph, 'ChainProvider.ChainMiddle').find(n => n.varName === 'base')!

      expect(pick(providerBase)).toStrictEqual({
        id: makeId(graph, 'ChainProvider', 'base'),
        varName: 'base',
        type: 'ref',
        deps: [],
        subs: [makeId(graph, 'ChainProvider.ChainMiddle', 'base')],
      })
      expect(pick(middleBase)).toStrictEqual({
        id: makeId(graph, 'ChainProvider.ChainMiddle', 'base'),
        varName: 'base',
        type: 'inject',
        deps: [makeId(graph, 'ChainProvider', 'base')],
        subs: [makeId(graph, 'ChainProvider.ChainMiddle', 'doubled')],
      })
    })

    it('inject node → computed node 互連', () => {
      const graph = runWalker(ChainProvider)
      const middleDoubled = getComponentNodes(graph, 'ChainProvider.ChainMiddle').find(n => n.varName === 'doubled')!

      expect(pick(middleDoubled)).toStrictEqual({
        id: makeId(graph, 'ChainProvider.ChainMiddle', 'doubled'),
        varName: 'doubled',
        type: 'computed',
        deps: [makeId(graph, 'ChainProvider.ChainMiddle', 'base')],
        subs: [makeId(graph, 'ChainProvider.ChainMiddle.ChainLeaf', 'result')],
      })
    })

    it('computed node → Leaf prop node 互連', () => {
      const graph = runWalker(ChainProvider)
      const leafResult = getComponentNodes(graph, 'ChainProvider.ChainMiddle.ChainLeaf')
        .find(n => n.varName === 'result')!

      expect(pick(leafResult)).toStrictEqual({
        id: makeId(graph, 'ChainProvider.ChainMiddle.ChainLeaf', 'result'),
        varName: 'result',
        type: 'prop',
        deps: [makeId(graph, 'ChainProvider.ChainMiddle', 'doubled')],
        subs: [],
      })
    })
  })

  describe('情境 ④ Pinia store ref → prop', () => {
    it('PiniaChild prop node.deps 指向 component wrapper node（非 store node）', () => {
      const graph = runWalker(PiniaParent, [createPinia()])
      const childValue = getComponentNodes(graph, 'PiniaParent.PiniaChild').find(n => n.varName === 'value')!

      expect(pick(childValue)).toStrictEqual({
        id: makeId(graph, 'PiniaParent.PiniaChild', 'value'),
        varName: 'value',
        type: 'prop',
        deps: [makeId(graph, 'PiniaParent', 'count')],
        subs: [],
      })
      expect(childValue.deps).not.toContain('integration.count')
    })

    it('PiniaParent count wrapper node.subs 包含 PiniaChild prop node id', () => {
      const graph = runWalker(PiniaParent, [createPinia()])
      const wrapperCount = getComponentNodes(graph, 'PiniaParent').find(n => n.id === makeId(graph, 'PiniaParent', 'count'))!

      expect(wrapperCount.subs).toContain(makeId(graph, 'PiniaParent.PiniaChild', 'value'))
    })
  })
})
