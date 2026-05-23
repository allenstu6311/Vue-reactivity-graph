import type { Data, WatchEffect } from '../../types/vue-internals'

export interface InstanceData {
  name: string
  filePath: string
  rawSetupState: Data
  watchEffects: WatchEffect[]
}
