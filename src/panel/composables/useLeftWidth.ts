const KEY = 'vrg.leftWidth'

export const LEFT_WIDTH_MIN = 180
export const LEFT_WIDTH_DEFAULT = 252
export const LEFT_WIDTH_MAX = 600

function clampWidth(n: number): number {
  return Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, n))
}

export function loadLeftWidth(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null || raw.trim() === '') return LEFT_WIDTH_DEFAULT

    const n = Number(raw)
    return Number.isFinite(n) ? clampWidth(n) : LEFT_WIDTH_DEFAULT
  } catch {
    return LEFT_WIDTH_DEFAULT
  }
}

export function saveLeftWidth(n: number): void {
  try {
    localStorage.setItem(KEY, String(clampWidth(n)))
  } catch {
    // silent fail
  }
}
