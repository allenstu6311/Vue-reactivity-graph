import { traverse } from './walker'
import type { ExtendedComponentInstance } from '../types/vue-internals'

interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null
  }
}

const appEl = document.querySelector('#app') as (Element & VueAppInternals) | null
const app = appEl?.__vue_app__?._instance

if (app) {
  traverse(app)
}
