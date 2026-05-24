import { devLog } from '../utils'
import type { GraphData } from '../../graph/types'
import { isString } from '../../shared/guards'

export function useGraphFetcher() {
  function fetchGraph(): Promise<GraphData | null> {
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        'JSON.stringify(window.__vueReactivityGraph)',
        (result, exception) => {
          if (exception) { devLog('fetchGraph error', exception); resolve(null); return }
          if (!isString(result)) { resolve(null); return }
          try { resolve(JSON.parse(result) as GraphData) } catch { resolve(null) }
        }
      )
    })
  }
  return { fetchGraph }
}
