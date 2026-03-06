import { traverse } from './walker'
import type { ExtendedComponentInstance } from '../types/vue-internals'
import { getGraph } from '../types/graph'

interface VueAppInternals {
  __vue_app__?: {
    _instance: ExtendedComponentInstance | null
  }
}

const appEl = document.querySelector('#app') as (Element & VueAppInternals) | null
const app = appEl?.__vue_app__?._instance

if (app) {
  traverse(app)

  const graph = getGraph();
  console.log('graph', graph)
}
