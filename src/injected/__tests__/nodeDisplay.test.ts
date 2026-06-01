// formatLeafValue() 單元測試
// 驗證葉節點值的顯示字串：null / undefined / 空字串轉成字面，其餘維持 String() 結果。
// 對應 bug：NodeDetail / ValTree 用 {{ }} 插值時，null / undefined / "" 會渲染成空白。
import { describe, it, expect } from 'vitest'
import { formatLeafValue } from '../../panel/components/shared/nodeDisplay'

describe('formatLeafValue', () => {
  it('null → 字面 "null"', () => {
    expect(formatLeafValue(null)).toBe('null')
  })

  it('undefined → 字面 "undefined"', () => {
    expect(formatLeafValue(undefined)).toBe('undefined')
  })

  it('空字串 → 字面 \'""\'', () => {
    expect(formatLeafValue('')).toBe('""')
  })

  it('非空字串維持原樣（不加引號）', () => {
    expect(formatLeafValue('hello')).toBe('hello')
  })

  it('數字 0 → "0"（不被當成空白）', () => {
    expect(formatLeafValue(0)).toBe('0')
  })

  it('boolean false → "false"', () => {
    expect(formatLeafValue(false)).toBe('false')
  })

  it('一般數字 → String() 結果', () => {
    expect(formatLeafValue(1798)).toBe('1798')
  })

  it('"[Circular]" 標記維持原樣', () => {
    expect(formatLeafValue('[Circular]')).toBe('[Circular]')
  })
})
