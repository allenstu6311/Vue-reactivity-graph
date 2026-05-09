import { onUnmounted } from 'vue'

export function useDevtoolsConnection(onUpdate: () => void) {
  const port = chrome.runtime.connect({ name: 'devtools-panel' })

  port.onMessage.addListener((msg) => {
    if (msg.type === 'VUE_GRAPH_UPDATE') onUpdate()
  })

  chrome.devtools.network.onNavigated.addListener(onUpdate)

  onUnmounted(() => {
    port.disconnect()
    chrome.devtools.network.onNavigated.removeListener(onUpdate)
  })

  return { port }
}
