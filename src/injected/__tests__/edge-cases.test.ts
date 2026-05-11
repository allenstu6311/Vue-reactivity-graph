import { describe, it, expect } from 'vitest'
import { defineComponent, ref, provide, inject, h } from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
import type { GraphNode } from '../../graph'

function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── Test 1：inject 無對應 provider ──────────────────────────────────────────
const NoProviderChild = defineComponent({
  name: 'NoProviderChild',
  setup() {
    const count = inject('missingKey', ref(0))
    return { count }
  },
  render() { return h('div') },
})

const NoProviderParent = defineComponent({
  name: 'NoProviderParent',
  setup() { return {} },
  render() { return h(NoProviderChild) },
})

// ── Test 2：鏈式 re-provide（A → B → C）──────────────────────────────────
const ChainC = defineComponent({
  name: 'ChainC',
  setup() {
    const num = inject('num', ref(0))
    return { num }
  },
  render() { return h('div') },
})

const ChainB = defineComponent({
  name: 'ChainB',
  setup() {
    const num = inject('num', ref(0))
    provide('num', num)
    return { num }
  },
  render() { return h(ChainC) },
})

const ChainA = defineComponent({
  name: 'ChainA',
  setup() {
    const num = ref(42)
    provide('num', num)
    return { num }
  },
  render() { return h(ChainB) },
})

// ── Test 3：provide 匿名 ref（父層未加入 setupState）──────────────────────
const AnonReceiver = defineComponent({
  name: 'AnonReceiver',
  setup() {
    const count = inject('count', ref(0))
    return { count }
  },
  render() { return h('div') },
})

const AnonProvider = defineComponent({
  name: 'AnonProvider',
  setup() {
    provide('count', ref(42))
    return {}
  },
  render() { return h(AnonReceiver) },
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Edge Cases', () => {
  it('inject 無對應 provider：節點類型為 ref，deps 為空（inject node 不建立）', () => {
    const graph = runWalker(NoProviderParent)
    const childNodes = getComponentNodes(graph, 'NoProviderParent.NoProviderChild')
    const countNode = childNodes.find(n => n.varName === 'count')

    expect(countNode?.type).toBe('ref')
    expect(countNode?.deps).toEqual([])
  })

  it('鏈式 re-provide A→B→C：C 直接連回 A，B 的 inject node subs 為空', () => {
    const graph = runWalker(ChainA)
    const get = (path: string, varName: string) =>
      getComponentNodes(graph, path).find(n => n.varName === varName)!

    const chainANum = get('ChainA', 'num')
    expect(pick(chainANum)).toStrictEqual({
      id: makeId(graph, 'ChainA', 'num'),
      varName: 'num',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'ChainA.ChainB', 'num'), makeId(graph, 'ChainA.ChainB.ChainC', 'num')],
    })

    const chainBNum = get('ChainA.ChainB', 'num')
    expect(pick(chainBNum)).toStrictEqual({
      id: makeId(graph, 'ChainA.ChainB', 'num'),
      varName: 'num',
      type: 'inject',
      deps: [makeId(graph, 'ChainA', 'num')],
      subs: [],
    })

    const chainCNum = get('ChainA.ChainB.ChainC', 'num')
    expect(pick(chainCNum)).toStrictEqual({
      id: makeId(graph, 'ChainA.ChainB.ChainC', 'num'),
      varName: 'num',
      type: 'inject',
      deps: [makeId(graph, 'ChainA', 'num')],
      subs: [],
    })
  })

  it('provide 匿名 ref：建 anonymous node，子層 inject 連回父層', () => {
    const graph = runWalker(AnonProvider)

    const parentNodes = getComponentNodes(graph, 'AnonProvider')
    const anonNode = parentNodes.find(n => n.varName === 'anonymous')
    expect(anonNode?.type).toBe('ref')
    expect(anonNode?.subs).toContain(makeId(graph, 'AnonProvider.AnonReceiver', 'count'))

    const childNodes = getComponentNodes(graph, 'AnonProvider.AnonReceiver')
    const countNode = childNodes.find(n => n.varName === 'count')
    expect(countNode?.type).toBe('inject')
    expect(countNode?.deps).toEqual([makeId(graph, 'AnonProvider', 'anonymous:count')])
  })
})
