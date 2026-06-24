// traverseVNode 互斥分支回歸測試
//
// Bug 根因：
//   舊版 traverseVNode 沒有 else if——走完 if (vnode.component) fn() 後，
//   繼續檢查 if (Array.isArray(vnode.children))。
//
//   當以 array children 形式傳遞子元件時（h(HostComp, null, [h(Child)])），
//   Vue 會把 array children 直接掛到 HostComp vnode 的 children 屬性上。
//   HostComp 的 render 若直接回傳該 slot vnode，則 HostComp.subTree === children[0]
//   （同一個 vnode 物件，且已掛載，.component 非空）。
//
//   traverseVNode(HostComp vnode) 的執行路徑：
//     1. vnode.component 非空 → fn(HostComp)
//        fn(HostComp) 內部 → traverseVNode(HostComp.subTree) → fn(Child) ← 第一次
//     2. 舊版繼續：if (Array.isArray(HostComp_vnode.children)) → true！
//        → children[0] === HostComp.subTree（同一物件）
//        → children[0].component 非空 → fn(Child) ← 第二次！
//
//   第一趟正常建節點並寫入 valNodeMap；
//   第二趟所有 val 都 valNodeMap.has 命中 → continue → nodes 為空 →
//   updateNodes 以空陣列覆蓋 → setup 變數節點消失。
//
// 修法：改為 else if，確保 component 分支與 children 分支互斥。

import { describe, it, expect } from 'vitest'
import { defineComponent, ref, computed, h } from 'vue'
import { runWalker, getComponentNodes } from './test-utils'

// ── 精確重現 bug 的元件結構 ──────────────────────────────────────────────
//
// 結構：App → HostComp（subTree 直接回傳 array children 的第一個 vnode）→ Child
//
// 關鍵：App 用 h(HostComp, null, [h(Child)]) 的 array 形式傳入 Child，
//       使 HostComp vnode.children 成為 array，且 children[0] === HostComp.subTree
//       （同一個已掛載的 Child vnode 物件）。

const InnerChild = defineComponent({
  name: 'InnerChild',
  setup() {
    const count = ref(10)
    const double = computed(() => count.value * 2)
    return { count, double }
  },
  render() { return h('div') },
})

// HostComp 直接把 array children 裡的第一個 vnode 當作 subTree 回傳
// 這使得 HostComp vnode 同時具備：
//   - vnode.component（已掛載）
//   - vnode.children 為 array，且 children[0] 就是 InnerChild vnode（同一物件）
const HostComp = defineComponent({
  name: 'HostComp',
  render() {
    // $slots.default 取得 array children 傳入的 vnode
    const slotVNodes = this.$slots.default?.() ?? []
    return slotVNodes[0] ?? h('div')
  },
})

// App 用 array 形式（非 slot object）傳入 InnerChild
// 產生：HostComp vnode.children = [InnerChild vnode]（array！）
const HostApp = defineComponent({
  name: 'HostApp',
  render() {
    // 注意：此寫法會有 Vue warning（建議使用 function slot），
    // 但功能上仍可正常掛載，且正是 bug 的觸發情境
    return h(HostComp, null, [h(InnerChild)])
  },
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('traverseVNode — component / children 互斥分支回歸測試', () => {
  describe('核心回歸：array children 讓同一 component vnode 被雙路徑走到', () => {
    it('InnerChild 的 setup 節點存在且不為空（未被第二趟空陣列覆蓋）', () => {
      // 若把修法 else if 改回 if，此測試應 FAIL：
      // 第二趟 collectInstance 讓 nodes 為空，updateNodes 覆蓋第一趟成果
      const graph = runWalker(HostApp)

      const meta = Object.values(graph.components).find(m => m.name === 'InnerChild')
      expect(meta).toBeDefined()

      const uid = meta!.uid.toString()
      const nodes = graph.nodes[uid] ?? []

      // 節點不應為空（bug 發生時此處為 []）
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('InnerChild 的 count 節點（ref）存在', () => {
      const graph = runWalker(HostApp)

      const meta = Object.values(graph.components).find(m => m.name === 'InnerChild')!
      const uid = meta.uid.toString()
      const nodes = graph.nodes[uid] ?? []

      const count = nodes.find(n => n.varName === 'count')
      expect(count).toBeDefined()
      expect(count!.type).toBe('ref')
    })

    it('InnerChild 的 double 節點（computed）存在且 deps 正確連到 count', () => {
      const graph = runWalker(HostApp)

      const meta = Object.values(graph.components).find(m => m.name === 'InnerChild')!
      const uid = meta.uid.toString()
      const nodes = graph.nodes[uid] ?? []

      const double = nodes.find(n => n.varName === 'double')
      expect(double).toBeDefined()
      expect(double!.type).toBe('computed')

      // Phase 2 (deps 連線) 也要正確，確認節點不是空殼
      expect(double!.deps).toContain(`${uid}.count`)
    })

    it('InnerChild 只被收集一次（id 不重複）', () => {
      const graph = runWalker(HostApp)

      const meta = Object.values(graph.components).find(m => m.name === 'InnerChild')!
      const uid = meta.uid.toString()
      const nodes = graph.nodes[uid] ?? []

      // 若被收集兩次，第二趟覆蓋為空，所以症狀是 nodes 為空而非重複
      // 但也確認 count 節點 id 只出現一次（防止未來變種 bug）
      const countNodes = nodes.filter(n => n.varName === 'count')
      expect(countNodes).toHaveLength(1)

      const doubleNodes = nodes.filter(n => n.varName === 'double')
      expect(doubleNodes).toHaveLength(1)
    })
  })

  describe('component 正常遍歷不受影響：多層巢狀仍能完整蒐集', () => {
    // 確認 else if 修法沒有讓正常的深層 component 路徑漏蒐集

    const DeepLeaf = defineComponent({
      name: 'DeepLeaf',
      setup() {
        const val = ref(7)
        return { val }
      },
      render() { return h('span') },
    })

    const DeepMiddle = defineComponent({
      name: 'DeepMiddle',
      render() { return h(DeepLeaf) },
    })

    const DeepRoot = defineComponent({
      name: 'DeepRoot',
      render() { return h(DeepMiddle) },
    })

    it('三層巢狀（DeepRoot → DeepMiddle → DeepLeaf）的 DeepLeaf 節點被正確蒐集', () => {
      const graph = runWalker(DeepRoot)

      const leafMeta = Object.values(graph.components).find(m => m.name === 'DeepLeaf')
      expect(leafMeta).toBeDefined()

      const uid = leafMeta!.uid.toString()
      const nodes = graph.nodes[uid] ?? []

      expect(nodes.length).toBeGreaterThan(0)
      const val = nodes.find(n => n.varName === 'val')
      expect(val).toBeDefined()
      expect(val!.type).toBe('ref')
    })
  })
})
