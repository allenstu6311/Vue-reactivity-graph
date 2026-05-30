// snapshot() 函數單元測試
// 驗證 snapshot 正確剝除 ref / computed 包裝、處理 reactive、__v_* key 過濾、
// 陣列展開與循環引用偵測。
// 核心 regression：computed 在 _value 尚未填入（未讀過 .value）前，
// snapshot 必須回傳 getter 的實際值，而不是 undefined。
import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { snapshot } from '../helper/nodes'

// ── 輔助：建立最小 mock computed 物件 ────────────────────────────────────────
// 模擬 ComputedRefImpl 的結構：
//   - __v_isRef === true → unref 會進入 ref 分支
//   - effect 存在      → unref 判定為 computed，改用 .value 而非 ._value
//   - _value            → 惰性快取（初始為 undefined，模擬 bug 發生前的狀態）
//   - value（getter）  → 強制求值的入口
function makeMockComputed<T>(getterResult: T): {
  __v_isRef: true
  effect: object
  _value: T | undefined
  readonly value: T
} {
  const obj = {
    __v_isRef: true as const,
    effect: {},         // 非空值即可，用來讓 unref 走 computed 路徑
    _value: undefined as T | undefined,
    get value(): T {
      return getterResult
    },
  }
  return obj
}

// ── describe: snapshot(computedRef) ──────────────────────────────────────────
describe('snapshot(computedRef)', () => {
  it('核心 regression：mock computed 的 _value 為 undefined 時，應回傳 getter 的實際值而非 undefined', () => {
    // 這個 mock 的 _value 永遠是 undefined，直接模擬 bug 情境
    const c = makeMockComputed(42)
    expect(c._value).toBeUndefined()           // 確認前提：_value 確實是 undefined
    expect(snapshot(c)).toBe(42)               // snapshot 必須走 .value，回傳正確值
  })

  it('核心 regression（真實 Vue computed）：未讀過 .value 前呼叫 snapshot，應回傳 getter 計算結果', () => {
    // 建立後直接傳給 snapshot，中間不插入任何 .value 讀取
    // Vue 3.5 ComputedRefImpl 採惰性求值：此時 _value 仍為 undefined（UNINITIALIZED 哨兵）
    const base = ref(10)
    const doubled = computed(() => base.value * 2)
    // ⚠ 這裡刻意不讀 doubled.value，保留「_value 未填入」的初始狀態
    expect(snapshot(doubled)).toBe(20)
  })

  it('computed getter 回傳字串時，snapshot 正確回傳字串', () => {
    const label = computed(() => 'hello')
    expect(snapshot(label)).toBe('hello')
  })

  it('computed getter 回傳物件時，snapshot 剝成純值（不含 __v_* key）', () => {
    const obj = computed(() => ({ a: 1, b: 2 }))
    expect(snapshot(obj)).toStrictEqual({ a: 1, b: 2 })
  })

  it('computed getter 回傳 null 時，snapshot 回傳 null', () => {
    const n = computed(() => null)
    expect(snapshot(n)).toBeNull()
  })
})

// ── describe: snapshot(ref) ───────────────────────────────────────────────────
describe('snapshot(ref)', () => {
  it('plain ref 包裝 primitive：snapshot 回傳內部值', () => {
    const r = ref(99)
    expect(snapshot(r)).toBe(99)
  })

  it('plain ref 包裝字串：snapshot 回傳字串', () => {
    const r = ref('world')
    expect(snapshot(r)).toBe('world')
  })

  it('plain ref 包裝物件：snapshot 剝成純值（不含 __v_* key）', () => {
    const r = ref({ x: 1, __v_isReactive: true, y: 2 })
    // __v_isReactive 是 __v_ 開頭，應被過濾
    expect(snapshot(r)).toStrictEqual({ x: 1, y: 2 })
  })

  it('plain ref 包裝 null：snapshot 回傳 null', () => {
    const r = ref(null)
    expect(snapshot(r)).toBeNull()
  })

  it('plain ref 包裝 0：snapshot 回傳 0', () => {
    const r = ref(0)
    expect(snapshot(r)).toBe(0)
  })
})

// ── describe: snapshot（純值 / 物件 / 特殊情境）──────────────────────────────
describe('snapshot（純值與物件）', () => {
  it('傳入 primitive 直接回傳', () => {
    expect(snapshot(123)).toBe(123)
    expect(snapshot('str')).toBe('str')
    expect(snapshot(true)).toBe(true)
    expect(snapshot(null)).toBeNull()
    expect(snapshot(undefined)).toBeUndefined()
  })

  it('物件中的 __v_* key 應被過濾', () => {
    const obj = { name: 'test', __v_isReactive: true, __v_skip: true, value: 42 }
    expect(snapshot(obj)).toStrictEqual({ name: 'test', value: 42 })
  })

  it('陣列：每個元素遞迴剝除', () => {
    const r1 = ref(1)
    const r2 = ref(2)
    expect(snapshot([r1, r2])).toStrictEqual([1, 2])
  })

  it('巢狀物件：遞迴剝除 ref', () => {
    const inner = ref(7)
    const obj = { nested: { count: inner } }
    expect(snapshot(obj)).toStrictEqual({ nested: { count: 7 } })
  })

  it('循環引用：回傳字串 "[Circular]"', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj['self'] = obj
    expect(snapshot(obj)).toStrictEqual({ a: 1, self: '[Circular]' })
  })
})
