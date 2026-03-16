import { useCameraStore } from '../stores/cameraStore'

interface NodeRect {
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
}

export function fitAllNodes(nodes: Map<string, NodeRect>): void {
  if (nodes.size === 0) return
  const all = Array.from(nodes.values())
  const minX = Math.min(...all.map(n => n.x))
  const minY = Math.min(...all.map(n => n.y))
  const maxX = Math.max(...all.map(n => n.x + n.width))
  const maxY = Math.max(...all.map(n => n.y + (n.minimized ? 32 : n.height)))
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const PADDING = 80
  const zoom = Math.min(vw / (maxX - minX + PADDING * 2), vh / (maxY - minY + PADDING * 2), 1.5)
  useCameraStore.getState().setCamera({
    zoom,
    x: (vw - (maxX + minX) * zoom) / 2,
    y: (vh - (maxY + minY) * zoom) / 2,
  })
}
