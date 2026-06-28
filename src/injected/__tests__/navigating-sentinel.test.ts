// Navigating Sentinel 專屬行為測試
// 驗證 value-backed navigating sentinel 帶來的新行為，現有測試未覆蓋的 gap
// 對應 spec.md §10 測試計畫、§3 核心設計、§7 四硬點
import { describe, it, expect, vi } from 'vitest'
import {
  defineComponent,
  ref,
  reactive,
  computed,
  provide,
  inject,
  h,
  createVNode,
} from 'vue'
import { runWalker, getComponentNodes, makeId } from './test-utils'
import type { GraphNode } from '../../graph'

function pick(node: GraphNode) {
  const { id, varName, type, deps, subs } = node
  return { id, varName, type, deps, subs }
}

// ──────────────────────────────────────────────────────────────────────────────
// Case 1：plain object 取出 ref（Branch B 多層鏈）
// 父層 `const num = ref(); const someObj = { test: num }`
// 子元件 `:test="someObj.test"`（具名 prop，非 v-bind）
// navigating 修好後，sentinel 的 chain 攜帶 [someObj, someObj.test(RefImpl)]
// resolveChain 從葉子掃：RefImpl 在 valNodeMap → 命中 → prop.deps 連到 num 節點
// ──────────────────────────────────────────────────────────────────────────────
const PlainObjRefChild = defineComponent({
  name: 'PlainObjRefChild',
  props: { test: Number },
  render() { return h('div') },
})

const PlainObjRefParent = defineComponent({
  name: 'PlainObjRefParent',
  setup() {
    const num = ref(42)
    const someObj = { test: num }
    return { num, someObj }
  },
  render() {
    return h(PlainObjRefChild, { test: (this as any).someObj.test })
  },
})

// ──────────────────────────────────────────────────────────────────────────────
// Case 2：深層 reactive、葉子是一般資料 → 連到根 reactive
// 父層 `const obj = reactive({ a: { b: 1 } })`
// 子元件 `:foo="obj.a.b"`
// chain = [reactiveProxy, raw.a, 1]
// resolveChain 從葉子掃：1 是 primitive skip，raw.a 是 plain object 無節點 skip，
// reactiveProxy → getRaw → raw target → valNodeMap 命中 → 連到 obj 節點
// ──────────────────────────────────────────────────────────────────────────────
const DeepReactiveChild = defineComponent({
  name: 'DeepReactiveChild',
  props: { foo: Number },
  render() { return h('div') },
})

const DeepReactiveParent = defineComponent({
  name: 'DeepReactiveParent',
  setup() {
    const obj = reactive({ a: { b: 1 } })
    return { obj }
  },
  render() {
    return h(DeepReactiveChild, { foo: (this as any).obj.a.b })
  },
})

// ──────────────────────────────────────────────────────────────────────────────
// Case 3：inject 來源 prop（驗證 nodeIdMap 涵蓋 inject 節點）
// 父層 provide 一個 ref → 子層 inject 後當 prop 往下傳給孫層
// 孫層的 prop.deps 必須連到子層的 inject 節點
// （舊版 nodeIdMap 只登記 setup 節點，inject 節點漏登記 → 連線斷掉）
// ──────────────────────────────────────────────────────────────────────────────
const InjectPropGrandchild = defineComponent({
  name: 'InjectPropGrandchild',
  props: { value: Number },
  render() { return h('div') },
})

const InjectPropChild = defineComponent({
  name: 'InjectPropChild',
  setup() {
    const injectedNum = inject('sharedNum', ref(0))
    return { injectedNum }
  },
  render() {
    return h(InjectPropGrandchild, { value: (this as any).injectedNum })
  },
})

const InjectPropParent = defineComponent({
  name: 'InjectPropParent',
  setup() {
    const sharedNum = ref(100)
    provide('sharedNum', sharedNum)
    return { sharedNum }
  },
  render() { return h(InjectPropChild) },
})

// ──────────────────────────────────────────────────────────────────────────────
// Case 4：衍生 prop 不誤連（apply trap 空鏈）
// `:foo="t(x)"` — render 裡呼叫 setupState 的函式
// sentinel.apply trap 回空鏈 sentinel → resolveChain([], ...) = undefined → 不連線
// 同時驗證同層純傳值 prop（`:bar="count"`）仍正常連線
// ──────────────────────────────────────────────────────────────────────────────
const DerivedPropChild = defineComponent({
  name: 'DerivedPropChild',
  props: { foo: String, bar: Number },
  render() { return h('div') },
})

const DerivedPropParent = defineComponent({
  name: 'DerivedPropParent',
  setup() {
    const count = ref(5)
    // t 是函式，模擬 i18n 的 t()，傳入 sentinel 後會被 apply trap 捕捉
    const t = (key: any) => String(key)
    return { count, t }
  },
  render() {
    const self = this as any
    // `:foo="t(count)"` → t 被當 sentinel，apply trap 回空鏈 → foo 不連線
    // `:bar="count"` → 正常 sentinel chain → bar 連到 count 節點
    return h(DerivedPropChild, {
      foo: self.t(self.count),
      bar: self.count,
    })
  },
})

// ──────────────────────────────────────────────────────────────────────────────
// Case 5：多個子元件並存時，apply trap 空鏈的隔離性
// 父層同時渲染兩個子元件：
//   - ChildA：props 中有 apply trap（`:label="t(x)"`），apply 回空鏈 → label 不連線
//   - ChildB：props 全為純傳值（`:count="count"`），正常連線
// 驗證：ChildA 的 label 不連線、ChildB 的 count 正常連線，不互相汙染
// （對比 spec.md §1 舊 Symbol 崩潰行為：整批子元件 prop 來源漏掉，現在每個子元件獨立）
// ──────────────────────────────────────────────────────────────────────────────
const MultiChildA = defineComponent({
  name: 'MultiChildA',
  props: { label: String },
  render() { return h('div') },
})

const MultiChildB = defineComponent({
  name: 'MultiChildB',
  props: { count: Number },
  render() { return h('div') },
})

const MultiSiblingParent = defineComponent({
  name: 'MultiSiblingParent',
  setup() {
    const count = ref(3)
    const t = (key: any) => String(key)
    return { count, t }
  },
  render() {
    const self = this as any
    return h('div', [
      // ChildA：label 來自 t(count)，apply trap 空鏈 → 不連線
      h(MultiChildA, { label: self.t(self.count) }),
      // ChildB：count 直接來自 ref，正常連線
      h(MultiChildB, { count: self.count }),
    ])
  },
})

// ──────────────────────────────────────────────────────────────────────────────
// Case 6：plain object 裡包 computed，sentinel chain 的 resolveChain 不觸發 computed getter
// 父層 someObj = { derived: computed(() => { counter++; return base.value }) }
// 子元件 `:foo="someObj.derived"`（具名 prop，Branch B 多層鏈）
// sentinel chain = [someObj, computedRef]
// resolveChain 從葉子掃：computedRef → getRaw(computedRef) = computedRef（本身無 __v_raw）
//   → valNodeMap.get(computedRef) 命中 → 回 node（不讀 .value）
// 正常 render 時 self.someObj.derived 存取 computed，Vue proxy unwrap 讀 .value（1 次）
// dry-run 後 counter 仍 === 1（resolveChain 不額外觸發 getter）
// ──────────────────────────────────────────────────────────────────────────────
const ComputedNoReadChild = defineComponent({
  name: 'ComputedNoReadChild',
  props: { foo: Number },
  render() { return h('div') },
})

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe('Navigating Sentinel 新行為', () => {
  // ── Case 1 ────────────────────────────────────────────────────────────────
  describe('Case 1 — plain object 取出 ref（Branch B 多層鏈）', () => {
    it('當父層 someObj.test 是 ref 時，子層 prop 的 deps 應連到 num 節點', () => {
      const graph = runWalker(PlainObjRefParent)
      const child = getComponentNodes(graph, 'PlainObjRefParent.PlainObjRefChild')

      expect(child).toBeDefined()
      const testProp = child.find(n => n.varName === 'test')!
      expect(testProp).toBeDefined()
      expect(testProp.type).toBe('prop')
      expect(testProp.deps).toContain(makeId(graph, 'PlainObjRefParent', 'num'))
    })

    it('當父層 someObj.test 是 ref 時，父層 num 節點的 subs 應包含子層 prop id', () => {
      const graph = runWalker(PlainObjRefParent)
      const parent = getComponentNodes(graph, 'PlainObjRefParent')

      const numNode = parent.find(n => n.varName === 'num')!
      expect(numNode).toBeDefined()
      expect(numNode.subs).toContain(
        makeId(graph, 'PlainObjRefParent.PlainObjRefChild', 'test'),
      )
    })
  })

  // ── Case 2 ────────────────────────────────────────────────────────────────
  describe('Case 2 — 深層 reactive、葉子是一般資料 → 歸根 reactive', () => {
    it('當 obj.a.b 是 primitive 時，子層 prop 的 deps 應歸根連到 obj 節點', () => {
      const graph = runWalker(DeepReactiveParent)
      const child = getComponentNodes(graph, 'DeepReactiveParent.DeepReactiveChild')

      expect(child).toBeDefined()
      const fooProp = child.find(n => n.varName === 'foo')!
      expect(fooProp).toBeDefined()
      expect(fooProp.type).toBe('prop')
      expect(fooProp.deps).toContain(makeId(graph, 'DeepReactiveParent', 'obj'))
    })

    it('當 obj.a.b 是 primitive 時，父層 obj 節點的 subs 應包含子層 prop id', () => {
      const graph = runWalker(DeepReactiveParent)
      const parent = getComponentNodes(graph, 'DeepReactiveParent')

      const objNode = parent.find(n => n.varName === 'obj')!
      expect(objNode).toBeDefined()
      expect(objNode.subs).toContain(
        makeId(graph, 'DeepReactiveParent.DeepReactiveChild', 'foo'),
      )
    })
  })

  // ── Case 3 ────────────────────────────────────────────────────────────────
  describe('Case 3 — inject 來源 prop（nodeIdMap 涵蓋 inject 節點）', () => {
    it('子層 inject 後往下傳給孫層，孫層 prop 的 deps 應連到子層的 inject 節點', () => {
      const graph = runWalker(InjectPropParent)
      const childPath = 'InjectPropParent.InjectPropChild'
      const grandchildPath = 'InjectPropParent.InjectPropChild.InjectPropGrandchild'

      const childNodes = getComponentNodes(graph, childPath)
      const grandchildNodes = getComponentNodes(graph, grandchildPath)

      expect(childNodes).toBeDefined()
      expect(grandchildNodes).toBeDefined()

      const injectNode = childNodes.find(n => n.varName === 'injectedNum')!
      expect(injectNode).toBeDefined()
      expect(injectNode.type).toBe('inject')

      const grandchildProp = grandchildNodes.find(n => n.varName === 'value')!
      expect(grandchildProp).toBeDefined()
      expect(grandchildProp.type).toBe('prop')
      // 孫層 prop 必須連到子層的 inject 節點（驗證 nodeIdMap 有登記 inject 節點）
      expect(grandchildProp.deps).toContain(
        makeId(graph, childPath, 'injectedNum'),
      )
    })

    it('子層 inject 節點的 subs 應包含孫層 prop id', () => {
      const graph = runWalker(InjectPropParent)
      const childPath = 'InjectPropParent.InjectPropChild'
      const grandchildPath = 'InjectPropParent.InjectPropChild.InjectPropGrandchild'

      const injectNode = getComponentNodes(graph, childPath).find(n => n.varName === 'injectedNum')!
      expect(injectNode.subs).toContain(
        makeId(graph, grandchildPath, 'value'),
      )
    })
  })

  // ── Case 4 ────────────────────────────────────────────────────────────────
  describe('Case 4 — 衍生 prop 不誤連（apply trap 空鏈）', () => {
    it('當 prop 值來自函式呼叫（t(x)）時，apply trap 回空鏈，該 prop 的 deps 應為空', () => {
      const graph = runWalker(DerivedPropParent)
      const child = getComponentNodes(graph, 'DerivedPropParent.DerivedPropChild')

      expect(child).toBeDefined()
      const fooProp = child.find(n => n.varName === 'foo')!
      expect(fooProp).toBeDefined()
      expect(fooProp.deps).toEqual([])
    })

    it('衍生 prop 不連線時，同層純傳值 prop 仍應正常連到來源 ref', () => {
      const graph = runWalker(DerivedPropParent)
      const child = getComponentNodes(graph, 'DerivedPropParent.DerivedPropChild')

      const barProp = child.find(n => n.varName === 'bar')!
      expect(barProp).toBeDefined()
      expect(barProp.deps).toContain(makeId(graph, 'DerivedPropParent', 'count'))
    })

    it('衍生 prop 不連線整體不崩潰（runWalker 不丟例外）', () => {
      expect(() => runWalker(DerivedPropParent)).not.toThrow()
    })
  })

  // ── Case 5 ────────────────────────────────────────────────────────────────
  describe('Case 5 — 多子元件並存時 apply trap 空鏈的隔離性', () => {
    it('apply trap（t(x)）導致 ChildA.label 不連線時，runWalker 不崩潰', () => {
      expect(() => runWalker(MultiSiblingParent)).not.toThrow()
    })

    it('ChildA.label 因 apply trap 空鏈不連線（deps 為空）', () => {
      const graph = runWalker(MultiSiblingParent)
      const childA = getComponentNodes(graph, 'MultiSiblingParent.MultiChildA')

      expect(childA).toBeDefined()
      const labelProp = childA.find(n => n.varName === 'label')!
      expect(labelProp).toBeDefined()
      expect(labelProp.deps).toEqual([])
    })

    it('ChildA 不連線不影響 ChildB：ChildB.count 仍正常連到父層 count ref', () => {
      const graph = runWalker(MultiSiblingParent)
      const childB = getComponentNodes(graph, 'MultiSiblingParent.MultiChildB')

      expect(childB).toBeDefined()
      const countProp = childB.find(n => n.varName === 'count')!
      expect(countProp).toBeDefined()
      expect(countProp.deps).toContain(makeId(graph, 'MultiSiblingParent', 'count'))
    })

    it('父層 count ref 的 subs 應包含 ChildB.count 的 id（不因 ChildA 被汙染）', () => {
      const graph = runWalker(MultiSiblingParent)
      const parent = getComponentNodes(graph, 'MultiSiblingParent')

      const countNode = parent.find(n => n.varName === 'count')!
      expect(countNode).toBeDefined()
      expect(countNode.subs).toContain(
        makeId(graph, 'MultiSiblingParent.MultiChildB', 'count'),
      )
    })
  })

  // ── Case 6 ────────────────────────────────────────────────────────────────
  describe('Case 6 — plain object 裡包 computed，resolveChain 不讀 .value 仍能連線', () => {
    // 驗證 spec.md 硬點 2：resolveChain 只做 getRaw(v)，不做 unref（即不讀 computed.value）
    // 但仍能命中 valNodeMap（因為 valNodeMap 的 key 是 computedRef 本身）
    // 側面驗證：prop 正確連到 computed 節點，表示 resolveChain 找到了 computed（沒有誤觸 getter）
    it('dry-run 完成後，prop 能連到 plain object 內層的 computed 節點', () => {
      let capturedCounter = 0

      const ComputedInObjChild = defineComponent({
        name: 'ComputedInObjChild',
        props: { foo: Number },
        render() { return h('div') },
      })

      const ComputedInObjParent = defineComponent({
        name: 'ComputedInObjParent',
        setup() {
          const base = ref(1)
          const derived = computed(() => {
            capturedCounter++
            return base.value * 2
          })
          // plain object 包著 computed（不是直接 return derived）
          const someObj = { derived }
          return { base, derived, someObj }
        },
        render() {
          // `:foo="someObj.derived"` — sentinel chain = [someObj, computedRef]
          // resolveChain 從葉子：computedRef → getRaw = computedRef → valNodeMap 命中（不讀 .value）
          return h(ComputedInObjChild, { foo: (this as any).someObj.derived })
        },
      })

      const graph = runWalker(ComputedInObjParent)

      const child = getComponentNodes(graph, 'ComputedInObjParent.ComputedInObjChild')
      expect(child).toBeDefined()
      const fooProp = child.find(n => n.varName === 'foo')!
      expect(fooProp).toBeDefined()
      // prop 連到 computed 節點，表示 resolveChain 正確找到 derived（不是 someObj）
      expect(fooProp.deps).toContain(makeId(graph, 'ComputedInObjParent', 'derived'))

      // 驗證 counter 沒有超過預期：
      // Vue 掛載時 render 存取 this.someObj.derived（Vue proxy unwrap computed → 1 次）
      // dry-run 時 resolveChain 不讀 .value → 不額外觸發
      // 注意：dry-run 的 render 透過 proxyToUse 執行，存取 this.someObj.derived 透過 Vue proxy 會再讀一次
      // 所以 counter 上限是 2（mount 1 + dry-run render 1），不應更多
      expect(capturedCounter).toBeLessThanOrEqual(2)
    })
  })
})
