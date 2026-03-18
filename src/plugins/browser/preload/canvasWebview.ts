import { ipcRenderer } from 'electron'

// Detect double-tap anywhere in the webview and signal the host canvas to zoom-fit this node.
let lastTapTime = 0
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  const now = Date.now()
  if (now - lastTapTime < 350) {
    lastTapTime = 0
    if (e.metaKey && e.shiftKey) {
      ipcRenderer.sendToHost('canvas:zoom-exit', {})
    } else {
      ipcRenderer.sendToHost('canvas:double-tap', {})
    }
  } else {
    lastTapTime = now
  }
}, { capture: true })
