import { useCameraStore } from '../stores/cameraStore'
import type { Camera } from '../stores/cameraStore'

export interface NodeRect {
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
}

const MINIMIZED_HEIGHT = 32
const FIT_PADDING = 80
const FIT_MAX_ZOOM = 1.5

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
  const maxY = Math.max(...all.map(n => n.y + (n.minimized ? MINIMIZED_HEIGHT : n.height)))
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
