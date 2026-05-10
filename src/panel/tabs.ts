export const TAB = {
  Components: 'components',
  Stores: 'stores',
} as const

export type Tab = typeof TAB[keyof typeof TAB]
