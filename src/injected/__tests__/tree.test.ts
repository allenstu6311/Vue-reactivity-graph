// ComponentTree parentUid 正確性測試
// 驗證同名元件多次使用時，每個 sentinel node 的 parentUid 正確指向各自的父層 instance
// 確保 ComponentTree 可以一對一還原父子關係（不會全塞進第一個同名父層）
import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { runWalker } from './test-utils'

// 三層結構：App → HomeView × 3，每個 HomeView → AboutView × 1
// 期望樹形：
//   App
//   ├── HomeView (inst A) → AboutView (inst a)
//   ├── HomeView (inst B) → AboutView (inst b)
//   └── HomeView (inst C) → AboutView (inst c)

const AboutView = defineComponent({
  name: 'AboutView',
  render() { return h('div') },
})

const HomeView = defineComponent({
  name: 'HomeView',
  render() { return h(AboutView) },
})

const App = defineComponent({
  name: 'App',
  render() {
    return h('div', [h(HomeView), h(HomeView), h(HomeView)])
  },
})

describe('ComponentTree parentUid — 同名元件多次使用', () => {
  it('每個 sentinel 的 parentUid 正確指向各自的父層 uid', () => {
    const graph = runWalker(App)

    // 從 graph.components 取出所有 meta
    const metas = Object.values(graph.components)

    // 依 name 分組
    const byName = (name: string) => metas.filter(m => m.name === name)

    const appNodes = byName('App')
    const homeNodes = byName('HomeView')
    const aboutNodes = byName('AboutView')

    // 數量正確
    expect(appNodes).toHaveLength(1)
    expect(homeNodes).toHaveLength(3)
    expect(aboutNodes).toHaveLength(3)

    const appUid = appNodes[0].uid

    // 三個 HomeView 的 parentUid 都指向 App
    for (const home of homeNodes) {
      expect(home.parentUid).toBe(appUid)
    }

    // 每個 AboutView 的 parentUid 各自指向不同的 HomeView（一對一關係）
    const homeUids = homeNodes.map(m => m.uid)
    const aboutParentUids = aboutNodes.map(m => m.parentUid!)

    // 每個 AboutView 都有一個 parentUid
    expect(aboutParentUids.every(uid => uid !== undefined)).toBe(true)

    // 每個 AboutView 的 parentUid 必須是某個 HomeView 的 uid
    for (const parentUid of aboutParentUids) {
      expect(homeUids).toContain(parentUid)
    }

    // 一對一：三個 AboutView 的 parentUid 兩兩不同（每個指向不同的 HomeView）
    const uniqueParentUids = new Set(aboutParentUids)
    expect(uniqueParentUids.size).toBe(3)
  })
})
