// Phase 4 — Provide / Inject
// 測試 inject 節點連回父層 provide 來源
// 測試兩個子元件 inject 同一個 provide 時各自獨立不互蓋
// 測試 inject 值被 computed 讀取時的 deps / subs 連線（跨元件完整 id）
// 驗收標準見 TEST_PLAN.md Phase 4
import { describe, it, expect } from 'vitest'
import { defineComponent, ref, reactive, provide, inject, computed, watch, readonly, h } from '@vue/runtime-core'
import { runWalker } from './test-utils'
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
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('ProviderComp', 'num'))).toStrictEqual({
      id: 'ProviderComp.num',
      varName: 'num',
      type: 'ref',
      deps: [],
      subs: ['ProviderComp.ReceiverComp.num'],
    })

    expect(pick(get('ProviderComp.ReceiverComp', 'num'))).toStrictEqual({
      id: 'ProviderComp.ReceiverComp.num',
      varName: 'num',
      type: 'inject',
      deps: ['ProviderComp.num'],
      subs: [],
    })
  })

  it('兩子元件 inject 同一 provide：各自建立獨立 inject node，父層 subs 包含兩者，不互蓋', () => {
    const graph = runWalker(SiblingProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('SiblingProvider', 'val'))).toStrictEqual({
      id: 'SiblingProvider.val',
      varName: 'val',
      type: 'ref',
      deps: [],
      subs: ['SiblingProvider.SiblingReceiverA.val', 'SiblingProvider.SiblingReceiverB.val'],
    })

    expect(pick(get('SiblingProvider.SiblingReceiverA', 'val'))).toStrictEqual({
      id: 'SiblingProvider.SiblingReceiverA.val',
      varName: 'val',
      type: 'inject',
      deps: ['SiblingProvider.val'],
      subs: [],
    })

    expect(pick(get('SiblingProvider.SiblingReceiverB', 'val'))).toStrictEqual({
      id: 'SiblingProvider.SiblingReceiverB.val',
      varName: 'val',
      type: 'inject',
      deps: ['SiblingProvider.val'],
      subs: [],
    })
  })

  it('inject 被 computed 讀取：computed.deps 包含 inject node id，inject node.subs 包含 computed node id', () => {
    const graph = runWalker(ComputedProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('ComputedProvider.ComputedConsumer', 'base'))).toStrictEqual({
      id: 'ComputedProvider.ComputedConsumer.base',
      varName: 'base',
      type: 'inject',
      deps: ['ComputedProvider.base'],
      subs: ['ComputedProvider.ComputedConsumer.double'],
    })

    expect(pick(get('ComputedProvider.ComputedConsumer', 'double'))).toStrictEqual({
      id: 'ComputedProvider.ComputedConsumer.double',
      varName: 'double',
      type: 'computed',
      deps: ['ComputedProvider.ComputedConsumer.base'],
      subs: [],
    })
  })

  it('inject 被 watch 讀取：w_0.deps 包含 inject node id', () => {
    const graph = runWalker(WatchProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('WatchProvider.WatchConsumer', 'count'))).toStrictEqual({
      id: 'WatchProvider.WatchConsumer.count',
      varName: 'count',
      type: 'inject',
      deps: ['WatchProvider.count'],
      subs: ['WatchProvider.WatchConsumer.w_0'],
    })

    expect(pick(get('WatchProvider.WatchConsumer', 'w_0'))).toStrictEqual({
      id: 'WatchProvider.WatchConsumer.w_0',
      varName: 'w_0',
      type: 'watch',
      deps: ['WatchProvider.WatchConsumer.count'],
      subs: [],
    })
  })

  it('provide readonly(ref(...))：inject node 連回父層 ref，deps / subs 互連', () => {
    const graph = runWalker(ReadonlyProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('ReadonlyProvider', 'count'))).toStrictEqual({
      id: 'ReadonlyProvider.count',
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: ['ReadonlyProvider.ReadonlyReceiver.count'],
    })

    expect(pick(get('ReadonlyProvider.ReadonlyReceiver', 'count'))).toStrictEqual({
      id: 'ReadonlyProvider.ReadonlyReceiver.count',
      varName: 'count',
      type: 'inject',
      deps: ['ReadonlyProvider.count'],
      subs: [],
    })
  })

  it('Symbol key provide / inject：inject node 連回父層 ref，deps / subs 互連', () => {
    const graph = runWalker(SymbolProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('SymbolProvider', 'count'))).toStrictEqual({
      id: 'SymbolProvider.count',
      varName: 'count',
      type: 'ref',
      deps: [],
      subs: ['SymbolProvider.SymbolReceiver.count'],
    })

    expect(pick(get('SymbolProvider.SymbolReceiver', 'count'))).toStrictEqual({
      id: 'SymbolProvider.SymbolReceiver.count',
      varName: 'count',
      type: 'inject',
      deps: ['SymbolProvider.count'],
      subs: [],
    })
  })

  it('provide reactive proxy：inject node 連回父層 reactive，deps / subs 互連', () => {
    const graph = runWalker(ReactiveProvider)
    const get = (key: string, varName: string) => graph[key].find(n => n.varName === varName)!

    expect(pick(get('ReactiveProvider', 'config'))).toStrictEqual({
      id: 'ReactiveProvider.config',
      varName: 'config',
      type: 'reactive',
      deps: [],
      subs: ['ReactiveProvider.ReactiveReceiver.config'],
    })

    expect(pick(get('ReactiveProvider.ReactiveReceiver', 'config'))).toStrictEqual({
      id: 'ReactiveProvider.ReactiveReceiver.config',
      varName: 'config',
      type: 'inject',
      deps: ['ReactiveProvider.config'],
      subs: [],
    })
  })
})
