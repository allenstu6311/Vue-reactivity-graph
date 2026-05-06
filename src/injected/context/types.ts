import type { Data, WatchEffect } from '../../types/vue-internals'

export interface InstanceData {
  file: string
  rawSetupState: Data
  watchEffects: WatchEffect[]
}
