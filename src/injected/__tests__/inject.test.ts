// Phase 4 — Provide / Inject
// 測試 inject 節點連回父層 provide 來源
// 測試兩個子元件 inject 同一個 provide 時各自獨立不互蓋
// 測試 inject 值被 computed 讀取時的 deps / subs 連線（跨元件完整 id）
// 驗收標準見 TEST_PLAN.md Phase 4
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, reactive, provide, inject, computed, watch, readonly, h } from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
import type { GraphNode } from '../../graph'

function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ── provide readonly(ref) ──────────────────────────────────────────────────
const ReadonlyReceiver = defineComponent({
  name: 'ReadonlyReceiver',
  setup() {
    const count = inject('count', ref(0))
    return { count }
  },
  render() { return h('div') },
})

const ReadonlyProvider = defineComponent({
  name: 'ReadonlyProvider',
  setup() {
    const count = ref(10)
    provide('count', readonly(count))
    return { count }
  },
  render() { return h(ReadonlyReceiver) },
})

// ── Symbol key ────────────────────────────────────────────────────────────
const SymbolKey = Symbol('count')

const SymbolReceiver = defineComponent({
  name: 'SymbolReceiver',
  setup() {
    const count = inject(SymbolKey, ref(0))
    return { count }
  },
  render() { return h('div') },
})

const SymbolProvider = defineComponent({
  name: 'SymbolProvider',
  setup() {
    const count = ref(42)
    provide(SymbolKey, count)
    return { count }
  },
  render() { return h(SymbolReceiver) },
})

// ── provide reactive proxy ─────────────────────────────────────────────────
const ReactiveReceiver = defineComponent({
  name: 'ReactiveReceiver',
  setup() {
    const config = inject('config', reactive({ name: '' }))
    return { config }
  },
  render() { return h('div') },
})

const ReactiveProvider = defineComponent({
  name: 'ReactiveProvider',
  setup() {
    const config = reactive({ name: 'test' })
    provide('config', config)
    return { config }
  },
  render() { return h(ReactiveReceiver) },
})

// ── inject ref 連回父層 ────────────────────────────────────────────────────
const ReceiverComp = defineComponent({
  name: 'ReceiverComp',
  setup() {
    const num = inject('num', ref(0))
    return { num }
  },
  render() { return h('div') },
})

const ProviderComp = defineComponent({
  name: 'ProviderComp',
  setup() {
    const num = ref(42)
    provide('num', num)
    return { num }
  },
  render() { return h(ReceiverComp) },
})

// ── 兩子元件 inject 同一 provide ────────────────────────────────────────────
const SiblingReceiverA = defineComponent({
  name: 'SiblingReceiverA',
  setup() {
    const val = inject('val', ref(0))
    return { val }
  },
  render() { return h('div') },
})

const SiblingReceiverB = defineComponent({
  name: 'SiblingReceiverB',
  setup() {
    const val = inject('val', ref(0))
    return { val }
  },
  render() { return h('div') },
})

const SiblingProvider = defineComponent({
  name: 'SiblingProvider',
  setup() {
    const val = ref(1)
    provide('val', val)
    return { val }
  },
  render() {
    return h('div', [h(SiblingReceiverA), h(SiblingReceiverB)])
  },
})

// ── inject 被 computed 讀取 ────────────────────────────────────────────────
const ComputedConsumer = defineComponent({
  name: 'ComputedConsumer',
  setup() {
    const base = inject('base', ref(0))
    const double = computed(() => base.value * 2)
    return { base, double }
  },
  render() { return h('div') },
})

const ComputedProvider = defineComponent({
  name: 'ComputedProvider',
  setup() {
    const base = ref(10)
    provide('base', base)
    return { base }
  },
  render() { return h(ComputedConsumer) },
})

// ── inject 被 watch 讀取 ───────────────────────────────────────────────────
const WatchConsumer = defineComponent({
  name: 'WatchConsumer',
  setup() {
    const count = inject('count', ref(0))
    watch(count, () => {})
    return { count }
  },
  render() { return h('div') },
})

const WatchProvider = defineComponent({
  name: 'WatchProvider',
  setup() {
    const count = ref(0)
    provide('count', count)
    return { count }
  },
  render() { return h(WatchConsumer) },
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Phase 4 — Provide / Inject', () => {
  it('inject ref：inject node 連回父層 ref，deps / subs 互連', () => {
    const graph = runWalker(ProviderComp)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const providerNum = get('ProviderComp', 'num')
    expect(pick(providerNum)).toStrictEqual({
      id: makeId(graph, 'ProviderComp', 'num'),
      varName: 'num',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'ProviderComp.ReceiverComp', 'num')],
    })

    const receiverNum = get('ProviderComp.ReceiverComp', 'num')
    expect(pick(receiverNum)).toStrictEqual({
      id: makeId(graph, 'ProviderComp.ReceiverComp', 'num'),
      varName: 'num',
      type: 'inject',
      deps: [makeId(graph, 'ProviderComp', 'num')],
      subs: [],
    })
  })

  it('兩子元件 inject 同一 provide：各自建立獨立 inject node，父層 subs 包含兩者，不互蓋', () => {
    const graph = runWalker(SiblingProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const providerVal = get('SiblingProvider', 'val')
    expect(pick(providerVal)).toStrictEqual({
      id: makeId(graph, 'SiblingProvider', 'val'),
      varName: 'val',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'SiblingProvider.SiblingReceiverA', 'val'), makeId(graph, 'SiblingProvider.SiblingReceiverB', 'val')],
    })

    const siblingAVal = get('SiblingProvider.SiblingReceiverA', 'val')
    expect(pick(siblingAVal)).toStrictEqual({
      id: makeId(graph, 'SiblingProvider.SiblingReceiverA', 'val'),
      varName: 'val',
      type: 'inject',
      deps: [makeId(graph, 'SiblingProvider', 'val')],
      subs: [],
    })

    const siblingBVal = get('SiblingProvider.SiblingReceiverB', 'val')
    expect(pick(siblingBVal)).toStrictEqual({
      id: makeId(graph, 'SiblingProvider.SiblingReceiverB', 'val'),
      varName: 'val',
      type: 'inject',
      deps: [makeId(graph, 'SiblingProvider', 'val')],
      subs: [],
    })
  })

  it('inject 被 computed 讀取：computed.deps 包含 inject node id，inject node.subs 包含 computed node id', () => {
    const graph = runWalker(ComputedProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const consumerBase = get('ComputedProvider.ComputedConsumer', 'base')
    expect(pick(consumerBase)).toStrictEqual({
      id: makeId(graph, 'ComputedProvider.ComputedConsumer', 'base'),
      varName: 'base',
      type: 'inject',
      deps: [makeId(graph, 'ComputedProvider', 'base')],
      subs: [makeId(graph, 'ComputedProvider.ComputedConsumer', 'double')],
    })

    const consumerDouble = get('ComputedProvider.ComputedConsumer', 'double')
    expect(pick(consumerDouble)).toStrictEqual({
      id: makeId(graph, 'ComputedProvider.ComputedConsumer', 'double'),
      varName: 'double',
      type: 'computed',
      deps: [makeId(graph, 'ComputedProvider.ComputedConsumer', 'base')],
      subs: [],
    })
  })

  it('inject 被 watch 讀取：w_0.deps 包含 inject node id', () => {
    const graph = runWalker(WatchProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!
    // watch 節點 varName 統一為 'watch'，改用 id 查找
    const getById = (path: string, idSuffix: string) => getComponentNodes(graph, path).find(n => n.id === makeId(graph, path, idSuffix))!

    const watchConsumerCount = get('WatchProvider.WatchConsumer', 'count')
    expect(pick(watchConsumerCount)).toStrictEqual({
      id: makeId(graph, 'WatchProvider.WatchConsumer', 'count'),
      varName: 'count',
      type: 'inject',
      deps: [makeId(graph, 'WatchProvider', 'count')],
      subs: [makeId(graph, 'WatchProvider.WatchConsumer', 'w_0')],
    })

    const watchConsumerW0 = getById('WatchProvider.WatchConsumer', 'w_0')
    expect(pick(watchConsumerW0)).toStrictEqual({
      id: makeId(graph, 'WatchProvider.WatchConsumer', 'w_0'),
      varName: 'watch',
      type: 'watch',
      deps: [makeId(graph, 'WatchProvider.WatchConsumer', 'count')],
      subs: [],
    })
  })

  it('provide readonly(ref(...))：inject node 連回父層 ref，deps / subs 互連', () => {
    const graph = runWalker(ReadonlyProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const readonlyProviderCount = get('ReadonlyProvider', 'count')
    expect(pick(readonlyProviderCount)).toStrictEqual({
      id: makeId(graph, 'ReadonlyProvider', 'count'),
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'ReadonlyProvider.ReadonlyReceiver', 'count')],
    })

    const readonlyReceiverCount = get('ReadonlyProvider.ReadonlyReceiver', 'count')
    expect(pick(readonlyReceiverCount)).toStrictEqual({
      id: makeId(graph, 'ReadonlyProvider.ReadonlyReceiver', 'count'),
      varName: 'count',
      type: 'inject',
      deps: [makeId(graph, 'ReadonlyProvider', 'count')],
      subs: [],
    })
  })

  it('Symbol key provide / inject：inject node 連回父層 ref，deps / subs 互連', () => {
    const graph = runWalker(SymbolProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const symbolProviderCount = get('SymbolProvider', 'count')
    expect(pick(symbolProviderCount)).toStrictEqual({
      id: makeId(graph, 'SymbolProvider', 'count'),
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: [makeId(graph, 'SymbolProvider.SymbolReceiver', 'count')],
    })

    const symbolReceiverCount = get('SymbolProvider.SymbolReceiver', 'count')
    expect(pick(symbolReceiverCount)).toStrictEqual({
      id: makeId(graph, 'SymbolProvider.SymbolReceiver', 'count'),
      varName: 'count',
      type: 'inject',
      deps: [makeId(graph, 'SymbolProvider', 'count')],
      subs: [],
    })
  })

  it('provide reactive proxy：inject node 連回父層 reactive，deps / subs 互連', () => {
    const graph = runWalker(ReactiveProvider)
    const get = (path: string, varName: string) => getComponentNodes(graph, path).find(n => n.varName === varName)!

    const reactiveProviderConfig = get('ReactiveProvider', 'config')
    expect(pick(reactiveProviderConfig)).toStrictEqual({
      id: makeId(graph, 'ReactiveProvider', 'config'),
      varName: 'config',
      type: 'reactive',
      deps: [],
      subs: [makeId(graph, 'ReactiveProvider.ReactiveReceiver', 'config')],
    })

    const reactiveReceiverConfig = get('ReactiveProvider.ReactiveReceiver', 'config')
    expect(pick(reactiveReceiverConfig)).toStrictEqual({
      id: makeId(graph, 'ReactiveProvider.ReactiveReceiver', 'config'),
      varName: 'config',
      type: 'inject',
      deps: [makeId(graph, 'ReactiveProvider', 'config')],
      subs: [],
    })
  })
})
