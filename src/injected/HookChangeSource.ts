import type { ExtendedComponentInstance } from '../types/vue-internals'
import type { WalkContext } from './context/WalkContext'
import { consumePendingHmrId } from './hmr'

const DEBOUNCE_DELAY = 150 // ms

/**
 * 訊號來源模組：監聽 devtools hook 的 component 事件
 *
 * 責任：
 * - 監聽 component:added / removed / updated 三事件
 * - 事件矩陣分流（一般 runtime 或 pending HMR）
 * - debounce 合併（150ms trailing）
 * - HMR override 捕捉（命中 pending HMR 時寫入 hmrOverrideMap）
 *
 * 對外介面：`setOnChange(callback)` 掛上更新邏輯的 callback
 */
export class HookChangeSource {
  private hook: { on?: (event: string, handler: Function) => void }
  private ctx: WalkContext
  private debounceTimer: number | undefined
  private onChange: (() => void) | undefined

  constructor(hook: { on?: (event: string, handler: Function) => void }, ctx: WalkContext) {
    this.hook = hook
    this.ctx = ctx

    // 監聽三個事件
    this.hook.on?.('component:added', this.onComponentAdded.bind(this))
    this.hook.on?.('component:removed', this.onComponentRemoved.bind(this))
    this.hook.on?.('component:updated', this.onComponentUpdated.bind(this))
  }

  /**
   * 掛上 onChange callback
   */
  setOnChange(callback: () => void): void {
    this.onChange = callback
  }

  /**
   * component:added 事件
   * - 一般 runtime：排程 scan
   * - pending HMR：寫 override ＋ 排程 scan
   */
  private onComponentAdded(app: any, uid: number, parent: any, instance: ExtendedComponentInstance): void {
    this.captureIfHmr(instance)
    this.scheduleUpdate()
  }

  /**
   * component:removed 事件
   * - 一般 runtime：排程 scan
   * - pending HMR：排程 scan
   */
  private onComponentRemoved(app: any, uid: number, parent: any, instance: ExtendedComponentInstance): void {
    // 移除時一般不會命中 pending HMR，但為完整性檢查
    this.captureIfHmr(instance)
    this.scheduleUpdate()
  }

  /**
   * component:updated 事件
   * - 一般 runtime：忽略（廉價檢查後早退，不排程）
   * - pending HMR：寫 override ＋ 排程 scan
   */
  private onComponentUpdated(app: any, uid: number, parent: any, instance: ExtendedComponentInstance): void {
    // 一般 updated 不排程，僅做 HMR 檢查
    if (!this.captureIfHmr(instance)) {
      return // 未命中 HMR，早退不排程
    }
    // 命中 HMR 才排程 scan
    this.scheduleUpdate()
  }

  /**
   * 檢查是否命中 pending HMR，命中則寫 override
   * @returns 是否命中 pending HMR
   */
  private captureIfHmr(instance: ExtendedComponentInstance): boolean {
    const hmrId = consumePendingHmrId(instance)
    if (hmrId) {
      this.ctx.hmrOverrideMap.set(hmrId, instance)
      return true
    }
    return false
  }

  /**
   * debounce 排程：合併連發的事件，150ms trailing 後呼叫 onChange
   */
  private scheduleUpdate(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined
      this.onChange?.()
    }, DEBOUNCE_DELAY)
  }
}
