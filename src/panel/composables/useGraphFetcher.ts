import { devLog } from '../utils'
import type { ComponentGraph } from '../../graph/types'

export function useGraphFetcher() {
  function fetchGraph(): Promise<ComponentGraph | null> {
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        'JSON.stringify(window.__vueReactivityGraph)',
        (result, exception) => {
          if (exception) { devLog('fetchGraph error', exception); resolve(null); return }
          if (typeof result !== 'string') { resolve(null); return }
          try { resolve(JSON.parse(result)) } catch { resolve(null) }
        }
      )
    })
  }
  return { fetchGraph }
}
