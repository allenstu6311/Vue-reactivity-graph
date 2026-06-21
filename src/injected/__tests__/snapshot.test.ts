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

// ── describe: snapshot 對 null / undefined 節點值 ────────────────────────────
// 確認「值為 null / undefined」在各層的行為：
//   1) snapshot 本身：null / undefined 原樣保留，不會被吃掉
//   2) panel 的 useGraphFetcher 走 JSON.stringify → JSON.parse round-trip：
//      null 存活，但 undefined 會被整個 key 丟掉（panel 端讀到 undefined）
describe('snapshot：null / undefined 節點值', () => {
  it('computed getter 回傳 undefined → snapshot 回傳 undefined', () => {
    expect(snapshot(computed(() => undefined))).toBeUndefined()
  })

  it('ref 包裝 undefined → snapshot 回傳 undefined', () => {
    expect(snapshot(ref(undefined))).toBeUndefined()
  })

  it('物件含 null / undefined 值 → 各自原樣保留', () => {
    expect(snapshot({ a: null, b: undefined, c: 1 })).toStrictEqual({
      a: null,
      b: undefined,
      c: 1,
    })
  })

  it('陣列含 null / undefined → 保留位置', () => {
    expect(snapshot([null, undefined, 1])).toStrictEqual([null, undefined, 1])
  })

  // 關鍵 round-trip：模擬 panel useGraphFetcher 的 JSON.stringify → JSON.parse
  it('round-trip：val 為 null 時存活', () => {
    const node = { id: '0.x', val: snapshot(computed(() => null)) }
    const parsed = JSON.parse(JSON.stringify(node))
    expect(parsed.val).toBeNull()
    expect('val' in parsed).toBe(true)
  })

  it('round-trip：val 為 undefined 時整個 key 被丟掉（panel 端讀到 undefined）', () => {
    const node = { id: '0.x', val: snapshot(computed(() => undefined)) }
    const parsed = JSON.parse(JSON.stringify(node))
    expect(parsed.val).toBeUndefined()
    expect('val' in parsed).toBe(false) // ← key 消失，並非顯式 null
  })
})

// ── describe: snapshot MAX_DEPTH 深度上限 ─────────────────────────────────────
// 驗收標準：深度 30 巢狀（> MAX_DEPTH 20）→ 在第 20 層左右回 '[MaxDepth]'，不爆 stack
describe('snapshot MAX_DEPTH：深度上限', () => {
  // 建立 depth 層的巢狀物件：{ level: 0, child: { level: 1, child: { ... } } }
  function makeDeepObject(depth: number): Record<string, unknown> {
    let obj: Record<string, unknown> = { level: depth }
    for (let i = depth - 1; i >= 0; i--) {
      obj = { level: i, child: obj }
    }
    return obj
  }

  it('深度 30 巢狀 → 不爆 call stack（不 throw RangeError）', () => {
    const deep = makeDeepObject(30)
    expect(() => snapshot(deep)).not.toThrow()
  })

  it('深度 30 巢狀 → snapshot 結果在第 20 層左右出現 "[MaxDepth]" 截斷', () => {
    const deep = makeDeepObject(30)
    const result = snapshot(deep) as Record<string, unknown>

    // 從根走到第 20 層，確認某層的 child 被截斷為 '[MaxDepth]'
    // MAX_DEPTH = 20，depth > MAX_DEPTH 才截斷，所以第 21 層（depth=21）時回傳截斷
    let node: unknown = result
    let foundMaxDepth = false
    for (let i = 0; i <= 25; i++) {
      if (node === '[MaxDepth]') {
        foundMaxDepth = true
        break
      }
      if (typeof node === 'object' && node !== null && 'child' in node) {
        node = (node as Record<string, unknown>).child
      } else {
        break
      }
    }
    expect(foundMaxDepth).toBe(true)
  })
})

// ── describe: snapshot fresh-getter（每次回傳全新物件）────────────────────────
// 驗收標準：getter 每次回傳全新物件 → seen WeakSet 永不命中，靠 MAX_DEPTH 停下，不爆 stack
// red 階段現況：目前 snapshot 沒有 depth 守門，會 RangeError
describe('snapshot fresh-getter：每次回傳全新物件', () => {
  it('getter 每次回傳全新物件 → 靠 MAX_DEPTH 停下，不爆 stack', () => {
    // 每次讀 child 都回傳一個新的物件（seen WeakSet 永不命中）
    const freshGetterObj = {
      get child() {
        return { get child() { return freshGetterObj.child } }
      },
    }
    expect(() => snapshot(freshGetterObj)).not.toThrow()
  })
})

// ── describe: snapshot Vue instance 偵測 ─────────────────────────────────────
// 驗收標準：Vue instance（內部 instance / public proxy）→ 回 '[VueComponent]'
// 驗收標準：業務物件 { uid: 123, name: 'x' }（只有 uid，無 vnode/subTree）→ 不誤判
describe('snapshot Vue instance 偵測', () => {
  it('形態 a（內部 instance）：帶 uid + vnode + subTree → 回 "[VueComponent]"', () => {
    // 模擬 ComponentInternalInstance 最小 fingerprint
    const mockInternalInstance = {
      uid: 1,
      vnode: {},
      subTree: {},
      someBusiness: 'x',
    }
    expect(snapshot(mockInternalInstance)).toBe('[VueComponent]')
  })

  it('形態 b（public proxy）：帶 _.vnode → 回 "[VueComponent]"', () => {
    // 模擬 ComponentPublicInstance：v._ 為含 vnode 的 plain object
    const mockPublicProxy = {
      _: { vnode: {} },
      foo: 1,
    }
    expect(snapshot(mockPublicProxy)).toBe('[VueComponent]')
  })

  it('不誤判：業務物件只有 uid（無 vnode / subTree）→ 正常剝成純值', () => {
    // 只有 uid 這個常見業務欄位，不應被誤判為 Vue instance
    const businessObj = { uid: 123, name: 'x' }
    expect(snapshot(businessObj)).toStrictEqual({ uid: 123, name: 'x' })
  })
})

// ── describe: snapshot BigInt 處理 ───────────────────────────────────────────
// 驗收標準：含 BigInt 的物件 → 可完整走完 JSON.stringify，不 throw
describe('snapshot BigInt 處理', () => {
  it('含 BigInt 的物件 → JSON.stringify 不 throw', () => {
    const obj = { big: 10n }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })

  it('含 BigInt 的物件 → snapshot 後 big 欄位是可讀字串', () => {
    const obj = { big: 10n }
    const result = snapshot(obj) as Record<string, unknown>
    // BigInt 應被轉為字串，如 '10n'
    expect(typeof result.big).toBe('string')
    expect(result.big).toContain('10')
  })
})

// ── describe: snapshot 陣列截斷 ──────────────────────────────────────────────
// 驗收標準：陣列 > 5000 → 截斷前 5000 + 尾端 "... N more items"
describe('snapshot 陣列截斷', () => {
  it('長度 6000 的陣列 → 結果長度為 5001（5000 項 + 1 個截斷提示）', () => {
    const arr = Array.from({ length: 6000 }, (_, i) => i)
    const result = snapshot(arr) as unknown[]
    expect(result).toHaveLength(5001)
  })

  it('長度 6000 的陣列 → 最後一個元素是 "... 1000 more items"', () => {
    const arr = Array.from({ length: 6000 }, (_, i) => i)
    const result = snapshot(arr) as unknown[]
    expect(result[5000]).toBe('... 1000 more items')
  })

  it('長度 6000 的陣列 → 前 5000 項值保留正確', () => {
    const arr = Array.from({ length: 6000 }, (_, i) => i)
    const result = snapshot(arr) as unknown[]
    // 抽樣確認幾個位置
    expect(result[0]).toBe(0)
    expect(result[4999]).toBe(4999)
  })

  it('長度 <= 5000 的陣列 → 不截斷，長度不變', () => {
    const arr = Array.from({ length: 5000 }, (_, i) => i)
    const result = snapshot(arr) as unknown[]
    expect(result).toHaveLength(5000)
    // 不應出現截斷提示
    expect(result[4999]).toBe(4999)
  })
})

// ── describe: snapshot 字串截斷 ──────────────────────────────────────────────
// 驗收標準：字串 > 10000 → 截斷 + "... (N total)" 後綴，開頭是原字串前 10000 字元
describe('snapshot 字串截斷', () => {
  it('長度 > 10000 的字串 → 含 "... (N total)" 後綴', () => {
    const longStr = 'a'.repeat(12000)
    const result = snapshot(longStr) as string
    expect(result).toContain('... (12000 total)')
  })

  it('長度 > 10000 的字串 → 開頭是原字串前 10000 字元', () => {
    const longStr = 'x'.repeat(12000)
    const result = snapshot(longStr) as string
    expect(result.startsWith('x'.repeat(10000))).toBe(true)
  })

  it('長度 <= 10000 的字串 → 原樣回傳（不截斷）', () => {
    const str = 'hello'.repeat(2000) // 10000 字元
    const result = snapshot(str)
    expect(result).toBe(str)
  })
})

// ── describe: snapshot 不破壞序列化的型別群 ──────────────────────────────────
// 驗收標準（範圍 B，不美化但不讓序列化炸掉）：
// Map / Set / Date / Symbol / Function → JSON.stringify(snapshot(x)) 不 throw
describe('snapshot 不破壞序列化的型別群（範圍 B）', () => {
  it('含 Map 的物件 → JSON.stringify 不 throw', () => {
    const obj = { m: new Map([['a', 1]]) }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })

  it('含 Set 的物件 → JSON.stringify 不 throw', () => {
    const obj = { s: new Set([1, 2]) }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })

  it('含 Date 的物件 → JSON.stringify 不 throw', () => {
    const obj = { d: new Date() }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })

  it('含 Symbol 的物件 → JSON.stringify 不 throw', () => {
    const obj = { sym: Symbol('x') }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })

  it('含 Function 的物件 → JSON.stringify 不 throw', () => {
    const obj = { fn: () => 1 }
    expect(() => JSON.stringify(snapshot(obj))).not.toThrow()
  })
})
