const panelPorts = new Set<chrome.runtime.Port>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'devtools-panel') return
  panelPorts.add(port)
  port.onDisconnect.addListener(() => {
    console.log('[background] panel disconnected')
    panelPorts.delete(port)
  })
})

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'VUE_GRAPH_UPDATE') return
  panelPorts.forEach((port) => port.postMessage({ type: 'VUE_GRAPH_UPDATE' }))
})
