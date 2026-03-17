import { useCameraStore } from '../stores/cameraStore'

interface NodeRect {
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
}

/** Returns the canvas element's actual dimensions, falling back to viewport size. */
export function getCanvasRect(): { width: number; height: number } {
  const el = document.querySelector('[data-canvas-root]') as HTMLElement | null
  if (el) {
    const r = el.getBoundingClientRect()
    return { width: r.width, height: r.height }
  }
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }
}

export function fitAllNodes(nodes: Map<string, NodeRect>): void {
  if (nodes.size === 0) return
  const all = Array.from(nodes.values())
  const minX = Math.min(...all.map(n => n.x))
  const minY = Math.min(...all.map(n => n.y))
  const maxX = Math.max(...all.map(n => n.x + n.width))
  const maxY = Math.max(...all.map(n => n.y + (n.minimized ? 32 : n.height)))
  const { width: vw, height: vh } = getCanvasRect()
  const PADDING = 80
  const zoom = Math.min(vw / (maxX - minX + PADDING * 2), vh / (maxY - minY + PADDING * 2), 1.5)
  useCameraStore.getState().setCamera({
    zoom,
    x: (vw - (maxX + minX) * zoom) / 2,
    y: (vh - (maxY + minY) * zoom) / 2,
  })
}
