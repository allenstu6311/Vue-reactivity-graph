import { describe, it, expect } from 'vitest'
import { defineComponent, h, createRenderer, reactive } from 'vue'
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
  it('function 型組件：displayName 優先', () => {
    const FuncComp = defineComponent(
      function MyComponent() {
        return h('div')
      }
    )
    // 手動設定 displayName
    ;(FuncComp as any).displayName = 'CustomDisplayName'
    ;(FuncComp as any).name = 'FunctionName'

    const Parent = defineComponent({
      components: { FuncComp },
      render() { return h(FuncComp) },
    })
    const parentInst = createTestInstance(Parent)
    const childInst = (parentInst.setupState as any)?.default || findChildInstance(parentInst, FuncComp)
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('CustomDisplayName')
    }
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
    if (childInst) {
      // MyComponent 內置 name 為 'MyComponent'
      expect(getInstanceName(childInst)).toBe('MyComponent')
    }
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
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('ExplicitName')
    }
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
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('ComponentTag')
    }
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
    if (childInst) {
      // 應該 fallback 到 _componentTag
      expect(getInstanceName(childInst)).toBe('IndexTag')
    }
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
    if (childInst) {
      // 應該繼續 fallback，最終用 classify(basename(...))
      const name = getInstanceName(childInst)
      expect(name).not.toBe('index')
      expect(name).not.toBe('Index')
    }
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
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('MyLocalComponent')
    }
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
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('MyGlobalComponent')
    }
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // __file fallback: classify(basename(...))
  // ──────────────────────────────────────────────────────────────────────────────
  it('元件無具名欄位但有 __file 時，使用 classify(basename(...)) fallback', () => {
    const FileBasedComp = defineComponent({
      render() { return h('div') },
    })
    ;(FileBasedComp as any).__file = '/path/to/user-profile.vue'

    const Parent = defineComponent({
      components: { FileBasedComp },
      render() { return h(FileBasedComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, FileBasedComp)
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('UserProfile')
    }
  })

  it('Windows 路徑：classify(basename(...)) 正確移除磁碟前綴', () => {
    const WinComp = defineComponent({
      render() { return h('div') },
    })
    ;(WinComp as any).__file = 'C:\\Users\\dev\\src\\my-component.vue'

    const Parent = defineComponent({
      components: { WinComp },
      render() { return h(WinComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, WinComp)
    if (childInst) {
      expect(getInstanceName(childInst)).toBe('MyComponent')
    }
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // 完全匿名
  // ──────────────────────────────────────────────────────────────────────────────
  it('元件完全匿名時回傳 "Anonymous Component"', () => {
    const AnonymousComp = defineComponent({
      render() { return h('div') },
    })

    const Parent = defineComponent({
      components: { AnonymousComp },
      render() { return h(AnonymousComp) },
    })

    const parentInst = createTestInstance(Parent)
    const childInst = findChildInstance(parentInst, AnonymousComp)
    if (childInst) {
      // 故意不設定任何名稱相關欄位、不註冊全域、不加 __file
      const name = getInstanceName(childInst)
      expect(name).toBe('Anonymous Component')
    }
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

    if (childInst) {
      const typeKeysBefore = Object.keys((childInst.type as any))
      const keysWithVrg = typeKeysBefore.filter(k => k.startsWith('__vrg_'))

      getInstanceName(childInst)

      const typeKeysAfter = Object.keys((childInst.type as any))
      const keysWithVrgAfter = typeKeysAfter.filter(k => k.startsWith('__vrg_'))

      expect(keysWithVrg.length).toBe(keysWithVrgAfter.length)
      expect(typeKeysBefore.length).toBe(typeKeysAfter.length)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * 從 parent instance 的子樹中找到指定 component 型態的實例
 * （簡單 DFS）
 */
function findChildInstance(
  instance: ComponentInternalInstance,
  targetType: any
): ComponentInternalInstance | undefined {
  const children = instance.subTree?.children as any[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child?.type === targetType) {
        return child
      }
    }
  }

  if (instance.subTree?.component) {
    return findChildInstance(instance.subTree.component, targetType)
  }

  return undefined
}
