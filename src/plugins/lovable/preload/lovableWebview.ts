import { ipcRenderer } from 'electron'

// Double-tap detection — mirrors canvasWebview.ts pattern
let lastTap = 0
let lastX = 0
let lastY = 0

document.addEventListener(
  'pointerdown',
  (e) => {
    const now = Date.now()
    if (now - lastTap < 350 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 30) {
      if (e.metaKey && e.shiftKey) {
        ipcRenderer.send('canvas:zoom-exit', {})
      } else {
        ipcRenderer.send('canvas:double-tap', {
          x: e.clientX,
          y: e.clientY,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        })
      }
      lastTap = 0
      return
    }
    lastTap = now
    lastX = e.clientX
    lastY = e.clientY
  },
  { passive: true },
)

// Pinch / trackpad-zoom forwarding
document.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    ipcRenderer.send('canvas:wheel', {
      deltaY: e.deltaY,
      clientX: e.clientX,
      clientY: e.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  },
  { passive: false },
)
