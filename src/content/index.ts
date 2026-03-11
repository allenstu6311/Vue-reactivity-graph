const script = document.createElement('script')
script.type = 'module';
script.src = chrome.runtime.getURL('injected.js')
document.documentElement.appendChild(script)

window.addEventListener('message', (e) => {
  if (e.source === window && e.data?.type === 'VUE_GRAPH_UPDATE') {
    chrome.runtime.sendMessage({ type: 'VUE_GRAPH_UPDATE' })
  }
})
