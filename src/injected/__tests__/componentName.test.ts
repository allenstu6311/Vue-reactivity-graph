import { describe, it, expect } from 'vitest'
import { defineComponent, h, createRenderer } from 'vue'
import type { ComponentInternalInstance } from 'vue'
import { getInstanceName } from '../helper/componentName'

// 建立 null renderer 用於測試
const { createApp: createNullApp } = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  insert: () => {},
  remove: () => {},
  parentNode: () => null,
  nextSibling: () => null,
} as any)

/**
 * 建立簡單的 Vue app 並取得 root instance，用於測試
 */
function createTestInstance(component: any): ComponentInternalInstance {
  const app = createNullApp(component)
  const container = {} as any
  app.mount(container)
  return (app as any)._instance as ComponentInternalInstance
}

describe('getInstanceName', () => {
  // ──────────────────────────────────────────────────────────────────────────────
  // Nullish input handling
  // ──────────────────────────────────────────────────────────────────────────────
  it('null 輸入回傳 "Anonymous Component"', () => {
    expect(getInstanceName(null)).toBe('Anonymous Component')
  })

  it('undefined 輸入回傳 "Anonymous Component"', () => {
    expect(getInstanceName(undefined)).toBe('Anonymous Component')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // Root instance
  // ──────────────────────────────────────────────────────────────────────────────
  it('instance.root === instance 時回傳 "Root"', () => {
    const RootComp = defineComponent({
      render() { return h('div') },
    })
    const instance = createTestInstance(RootComp)
    expect(getInstanceName(instance)).toBe('Root')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // Function component: displayName / name
  // ──────────────────────────────────────────────────────────────────────────────
  it('function 型組件：displayName 優先（getComponentTypeName function 分支）', () => {
    // functional component 不建立 ComponentInternalInstance，無法用掛載取得實例，
    // 故以最小 instance 直接驗證 function-type 分支：displayName 優先於 name。
    function MyComponent() {
      return h('div')
    }
    ;(MyComponent as any).displayName = 'CustomDisplayName'

    const fakeInstance = {
      type: MyComponent,
      root: null,
      parent: null,
      appContext: null,
    } as unknown as ComponentInternalInstance

    expect(getInstanceName(fakeInstance)).toBe('CustomDisplayName')
  })

  it('function 型組件：displayName 不存在時用內置 name', () => {
    function MyComponent() {
      return h('div')
    }
    // 注意：function 的 name 屬性是唯讀的，但在定義時就有值
    ;(MyComponent as any).displayName = undefined

    const Parent = defineComponent({
      components: { MyComponent },
      render() { return h(MyComponent) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, MyComponent)
    expect(childInst).toBeDefined()
    // MyComponent 內置 name 為 'MyComponent'
    expect(getInstanceName(childInst!)).toBe('MyComponent')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // Object component: name / _componentTag / __name
  // ──────────────────────────────────────────────────────────────────────────────
  it('object 型組件：明確設定 name 優先於 __name', () => {
    const ExplicitNameChild = defineComponent({
      name: 'ExplicitName',
      render() { return h('div') },
    })
    // Vite 模擬編譯時添加的 __name
    ;(ExplicitNameChild as any).__name = 'ViteGeneratedName'

    const Parent = defineComponent({
      components: { ExplicitNameChild },
      render() { return h(ExplicitNameChild) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, ExplicitNameChild)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('ExplicitName')
  })

  it('object 型組件：_componentTag fallback', () => {
    const TagChild = defineComponent({
      render() { return h('div') },
    })
    ;(TagChild as any)._componentTag = 'ComponentTag'
    ;(TagChild as any).__name = 'ViteName'

    const Parent = defineComponent({
      components: { TagChild },
      render() { return h(TagChild) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, TagChild)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('ComponentTag')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // index.vue special case
  // ──────────────────────────────────────────────────────────────────────────────
  it('name === "index" 且 __file 以 index.vue 結尾時，視為空字串往下 fallback', () => {
    const IndexComp = defineComponent({
      name: 'index',
      render() { return h('div') },
    })
    ;(IndexComp as any).__file = '/path/to/views/index.vue'
    ;(IndexComp as any)._componentTag = 'IndexTag'

    const Parent = defineComponent({
      components: { IndexComp },
      render() { return h(IndexComp) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, IndexComp)
    expect(childInst).toBeDefined()
    // 應該 fallback 到 _componentTag
    expect(getInstanceName(childInst!)).toBe('IndexTag')
  })

  it('__name === "index" 且 __file 以 index.vue 結尾時，視為空字串往下 fallback', () => {
    const IndexComp = defineComponent({
      render() { return h('div') },
    })
    ;(IndexComp as any).__name = 'index'
    ;(IndexComp as any).__file = '/path/to/components/index.vue'

    const Parent = defineComponent({
      components: { IndexComp },
      render() { return h(IndexComp) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, IndexComp)
    expect(childInst).toBeDefined()
    // 應該繼續 fallback，最終用 classify(basename(...))
    const name = getInstanceName(childInst!)
    expect(name).not.toBe('index')
    expect(name).not.toBe('Index')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // 反查 parent.type.components（區域註冊）
  // ──────────────────────────────────────────────────────────────────────────────
  it('反查 parent.type.components 命中時回傳註冊 key', () => {
    const LocalChild = defineComponent({
      render() { return h('div') },
    })

    const Parent = defineComponent({
      components: {
        'MyLocalComponent': LocalChild,
      },
      render() { return h(LocalChild) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, LocalChild)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('MyLocalComponent')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // 反查 appContext.components（全域註冊）
  // ──────────────────────────────────────────────────────────────────────────────
  it('反查 appContext.components 命中時回傳全域註冊 key', () => {
    const GlobalChild = defineComponent({
      render() { return h('div') },
    })

    const Parent = defineComponent({
      render() { return h(GlobalChild) },
    })

    const app = createNullApp(Parent)
    app.component('MyGlobalComponent', GlobalChild)

    const container = {} as any
    app.mount(container)

    const parentInst = (app as any)._instance as ComponentInternalInstance
    const childInst = findChildInstance(parentInst, GlobalChild)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('MyGlobalComponent')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // __file fallback: classify(basename(...))
  // ──────────────────────────────────────────────────────────────────────────────
  it('元件無具名欄位但有 __file 時，使用 classify(basename(...)) fallback', () => {
    const FileBasedComp = defineComponent({
      render() { return h('div') },
    })
    ;(FileBasedComp as any).__file = '/path/to/user-profile.vue'

    // 不在 components 註冊，避免反查 registration key 搶在 __file fallback 之前命中
    const Parent = defineComponent({
      render() { return h(FileBasedComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, FileBasedComp)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('UserProfile')
  })

  it('Windows 路徑：classify(basename(...)) 正確移除磁碟前綴', () => {
    const WinComp = defineComponent({
      render() { return h('div') },
    })
    ;(WinComp as any).__file = 'C:\\Users\\dev\\src\\my-component.vue'

    // 不在 components 註冊，確保走到 __file fallback
    const Parent = defineComponent({
      render() { return h(WinComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, WinComp)
    expect(childInst).toBeDefined()
    expect(getInstanceName(childInst!)).toBe('MyComponent')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // 完全匿名
  // ──────────────────────────────────────────────────────────────────────────────
  it('元件完全匿名時回傳 "Anonymous Component"', () => {
    const AnonymousComp = defineComponent({
      render() { return h('div') },
    })

    // 不在 components 註冊，確保最終 fallback 到 'Anonymous Component'
    const Parent = defineComponent({
      render() { return h(AnonymousComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, AnonymousComp)
    expect(childInst).toBeDefined()
    // 故意不設定任何名稱相關欄位、不註冊全域、不加 __file
    expect(getInstanceName(childInst!)).toBe('Anonymous Component')
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // 不寫回 Vue 物件
  // ──────────────────────────────────────────────────────────────────────────────
  it('呼叫 getInstanceName 後不在 instance.type 上寫入新屬性', () => {
    const TestComp = defineComponent({
      render() { return h('div') },
    })

    const Parent = defineComponent({
      components: { TestComp },
      render() { return h(TestComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, TestComp)
    expect(childInst).toBeDefined()

    const typeKeysBefore = Object.keys((childInst!.type as any))
    const keysWithVrg = typeKeysBefore.filter(k => k.startsWith('__vrg_'))

    getInstanceName(childInst!)

    const typeKeysAfter = Object.keys((childInst!.type as any))
    const keysWithVrgAfter = typeKeysAfter.filter(k => k.startsWith('__vrg_'))

    expect(keysWithVrg.length).toBe(keysWithVrgAfter.length)
    expect(typeKeysBefore.length).toBe(typeKeysAfter.length)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * 從 parent instance 的子樹中找到指定 component 型態的實例（簡單 DFS）。
 *
 * 注意：subTree 在「父層 render 直接回傳 h(Child)」時，subTree 本身即為該
 * component vnode（type === Child、component 為子實例），必須先檢查 subTree
 * 自身，否則會直接遞迴進子實例內部、永遠找不到目標。
 */
function findChildInstance(
  instance: ComponentInternalInstance,
  targetType: any
): ComponentInternalInstance | undefined {
  const st = instance.subTree as any
  if (!st) return undefined

  // subTree 本身即目標組件
  if (st.type === targetType && st.component) {
    return st.component as ComponentInternalInstance
  }

  // subTree 的 children 陣列中尋找
  if (Array.isArray(st.children)) {
    for (const child of st.children) {
      if (child?.type === targetType && child?.component) {
        return child.component as ComponentInternalInstance
      }
    }
  }

  // 遞迴進入已渲染的子組件
  if (st.component) {
    return findChildInstance(st.component, targetType)
  }

  return undefined
}
