import { useCameraStore } from '../stores/cameraStore'
import type { Camera } from '../stores/cameraStore'
import { useCanvasViewportStore } from '../stores/canvasViewportStore'

export interface NodeRect {
  x: number
  y: number
  width: number
  height: number
}

const FIT_PADDING = 20
const FIT_MAX_ZOOM = 2.0

/** Returns the canvas content area dimensions, excluding sidebar and title/tab bars. */
export function getCanvasRect(): { width: number; height: number } {
  const { left, top } = useCanvasViewportStore.getState()
  return {
    width: document.documentElement.clientWidth - left,
    height: document.documentElement.clientHeight - top,
  }
}

/**
 * Pure calculation: given a set of nodes and a viewport size, returns the
 * camera state that fits all nodes into view. Returns null if there are no nodes.
 */
export function computeFitCamera(
  nodes: Map<string, NodeRect>,
  viewportWidth: number,
  viewportHeight: number,
): Camera | null {
  if (nodes.size === 0) return null
  const all = Array.from(nodes.values())
  const minX = Math.min(...all.map(n => n.x))
  const minY = Math.min(...all.map(n => n.y))
  const maxX = Math.max(...all.map(n => n.x + n.width))
  const maxY = Math.max(...all.map(n => n.y + n.height))
  const contentW = maxX - minX + FIT_PADDING * 2
  const contentH = maxY - minY + FIT_PADDING * 2
  const zoom = Math.min(viewportWidth / contentW, viewportHeight / contentH, FIT_MAX_ZOOM)
  return {
    zoom,
    x: (viewportWidth - (maxX + minX) * zoom) / 2,
    y: (viewportHeight - (maxY + minY) * zoom) / 2,
  }
}

export function fitAllNodes(nodes: Map<string, NodeRect>): void {
  const { width: vw, height: vh } = getCanvasRect()
  const camera = computeFitCamera(nodes, vw, vh)
  if (camera) useCameraStore.getState().setCamera(camera)
}
