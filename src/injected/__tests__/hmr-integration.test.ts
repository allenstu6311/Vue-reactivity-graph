import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HookChangeSource } from '../HookChangeSource'
import { WalkContext } from '../context/WalkContext'
import { patchHmrRuntime, consumePendingHmrId } from '../hmr'
import type { ExtendedComponentInstance } from '../../types/vue-internals'

// 使用假時間以便測試 debounce
const FakeTimers = () => {
  vi.useFakeTimers()
}

/**
 * 假 hook 物件，可手動 emit 事件
 */
class FakeHook {
  private listeners: Map<string, Function[]> = new Map()

  on(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.listeners.get(event) ?? []
    for (const handler of handlers) {
      handler(...args)
    }
  }
}

/**
 * 建立假 component instance，帶 __hmrId（模擬 HMR reload/rerender）
 */
function createFakeInstance(hmrId?: string): any {
  const instance = {
    type: hmrId ? { __hmrId: hmrId } : {},
  }
  return instance
}

describe('HookChangeSource', () => {
  let ctx: WalkContext
  let hook: FakeHook
  let changeCallback: () => void

  beforeEach(() => {
    ctx = new WalkContext()
    hook = new FakeHook()
    changeCallback = vi.fn()
  })

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should debounce multiple added events into single onChange call', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      // 連發三個 added 事件
      hook.emit('component:added', { _instance: {} }, 1, undefined, createFakeInstance())
      hook.emit('component:added', { _instance: {} }, 2, undefined, createFakeInstance())
      hook.emit('component:added', { _instance: {} }, 3, undefined, createFakeInstance())

      // 立即檢查：debounce 期間，onChange 未被呼叫
      expect(onChange).not.toHaveBeenCalled()

      // 推進時間 150ms（debounce delay）
      vi.advanceTimersByTime(150)

      // 應該只被呼叫一次
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('should debounce mixed events (added/removed)', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      hook.emit('component:added', { _instance: {} }, 1, undefined, createFakeInstance())
      hook.emit('component:removed', { _instance: {} }, 2, undefined, createFakeInstance())
      hook.emit('component:added', { _instance: {} }, 3, undefined, createFakeInstance())

      vi.advanceTimersByTime(150)

      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('event matrix', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should schedule update for component:added', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      hook.emit('component:added', { _instance: {} }, 1, undefined, createFakeInstance())

      vi.advanceTimersByTime(150)

      expect(onChange).toHaveBeenCalled()
    })

    it('should schedule update for component:removed', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      hook.emit('component:removed', { _instance: {} }, 1, undefined, createFakeInstance())

      vi.advanceTimersByTime(150)

      expect(onChange).toHaveBeenCalled()
    })

    it('should NOT schedule update for general component:updated (no HMR)', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      // 一般 updated（無 HMR）：直接 emit，無 pending HMR ID
      hook.emit('component:updated', { _instance: {} }, 1, undefined, createFakeInstance())

      vi.advanceTimersByTime(150)

      // 不應排程
      expect(onChange).not.toHaveBeenCalled()
    })

    it('should capture HMR and schedule for component:added', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      // 模擬 HMR reload：先 patch runtime，再 emit added 並命中 pending
      const hmrRuntime = {
        __vrg_patched: false,
        reload: vi.fn(),
        rerender: vi.fn(),
      }
      patchHmrRuntime(hmrRuntime)
      hmrRuntime.reload('comp-id-1', {})

      const instance = createFakeInstance('comp-id-1')
      hook.emit('component:added', { _instance: {} }, 1, undefined, instance)

      // 應寫入 override
      expect(ctx.hmrOverrideMap.get('comp-id-1')).toBe(instance)

      vi.advanceTimersByTime(150)

      // 應排程 scan
      expect(onChange).toHaveBeenCalled()
    })

    it('should capture HMR and schedule for component:updated', () => {
      const onChange = vi.fn()
      const source = new HookChangeSource(hook, ctx)
      source.setOnChange(onChange)

      // 模擬 HMR rerender
      const hmrRuntime = {
        __vrg_patched: false,
        reload: vi.fn(),
        rerender: vi.fn(),
      }
      patchHmrRuntime(hmrRuntime)
      hmrRuntime.rerender('comp-id-2', {})

      const instance = createFakeInstance('comp-id-2')
      hook.emit('component:updated', { _instance: {} }, 1, undefined, instance)

      // 應寫入 override
      expect(ctx.hmrOverrideMap.get('comp-id-2')).toBe(instance)

      vi.advanceTimersByTime(150)

      // 應排程 scan
      expect(onChange).toHaveBeenCalled()
    })
  })

  describe('HMR override management', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should clear hmrOverrideMap after onChange execution', () => {
      const source = new HookChangeSource(hook, ctx)

      // 模擬 HMR + added
      const hmrRuntime = {
        __vrg_patched: false,
        reload: vi.fn(),
        rerender: vi.fn(),
      }
      patchHmrRuntime(hmrRuntime)
      hmrRuntime.reload('comp-id-3', {})

      const instance = createFakeInstance('comp-id-3')
      hook.emit('component:added', { _instance: {} }, 1, undefined, instance)

      // debounce 期間，override 應存在
      expect(ctx.hmrOverrideMap.has('comp-id-3')).toBe(true)

      // onChange 在外層 try-finally 中執行
      // 此處模擬 onChange 被呼叫並清空 override
      const onChange = () => {
        ctx.hmrOverrideMap.clear()
      }
      source.setOnChange(onChange)

      vi.advanceTimersByTime(150)

      // onChange 已被呼叫，override 應被清空
      expect(ctx.hmrOverrideMap.size).toBe(0)
    })
  })

  describe('consumePendingHmrId', () => {
    it('should return and remove pending HMR ID', () => {
      const hmrRuntime = {
        __vrg_patched: false,
        reload: vi.fn(),
        rerender: vi.fn(),
      }
      patchHmrRuntime(hmrRuntime)
      hmrRuntime.reload('comp-id-4', {})

      const instance = createFakeInstance('comp-id-4')
      const result = consumePendingHmrId(instance)

      expect(result).toBe('comp-id-4')

      // 再次調用應回傳 undefined（已被移除）
      const secondResult = consumePendingHmrId(instance)
      expect(secondResult).toBeUndefined()
    })

    it('should return undefined for non-pending HMR ID', () => {
      const instance = createFakeInstance('non-existent')
      const result = consumePendingHmrId(instance)

      expect(result).toBeUndefined()
    })

    it('should return undefined for instance without __hmrId', () => {
      const instance = createFakeInstance() // 無 hmrId
      const result = consumePendingHmrId(instance)

      expect(result).toBeUndefined()
    })
  })

  describe('hook not found', () => {
    it('should not throw if hook.on is not available', () => {
      const fakeHook = {} // 無 on 方法
      expect(() => {
        new HookChangeSource(fakeHook as any, ctx)
      }).not.toThrow()
    })

    it('should handle undefined hook.on gracefully', () => {
      const fakeHook = { on: undefined }
      expect(() => {
        new HookChangeSource(fakeHook as any, ctx)
      }).not.toThrow()
    })
  })
})
