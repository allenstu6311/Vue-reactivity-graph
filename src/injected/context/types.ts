import type { Data, WatchEffect } from '../../types/vue-internals'

export interface InstanceData {
  name: string
  file: string
  filePath: string
  rawSetupState: Data
  watchEffects: WatchEffect[]
}
