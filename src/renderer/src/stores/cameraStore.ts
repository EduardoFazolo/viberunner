import { create } from 'zustand'

export interface Camera {
  x: number
  y: number
  zoom: number
}

interface CameraStore {
  camera: Camera
  setCamera: (camera: Camera) => void
  pan: (dx: number, dy: number) => void
  zoomAt: (screenX: number, screenY: number, delta: number) => void
  zoomByFactor: (factor: number) => void
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.001

// Last known cursor position — updated by a global mousemove listener in Canvas
export const cursorPos = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => { cursorPos.x = e.clientX; cursorPos.y = e.clientY }, { passive: true })
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  camera: { x: 0, y: 0, zoom: 1 },

  setCamera: (camera) => set({ camera }),

  pan: (dx, dy) => set((s) => ({
    camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy }
  })),

  zoomAt: (screenX, screenY, delta) => set((s) => {
    const { camera } = s
    const factor = 1 - delta * ZOOM_SPEED
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
    const zoomRatio = newZoom / camera.zoom
    return {
      camera: {
        zoom: newZoom,
        x: screenX - zoomRatio * (screenX - camera.x),
        y: screenY - zoomRatio * (screenY - camera.y),
      }
    }
  }),

  zoomByFactor: (factor) => set((s) => {
    const { camera } = s
    const cx = cursorPos.x || document.documentElement.clientWidth / 2
    const cy = cursorPos.y || document.documentElement.clientHeight / 2
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
    const zoomRatio = newZoom / camera.zoom
    return {
      camera: {
        zoom: newZoom,
        x: cx - zoomRatio * (cx - camera.x),
        y: cy - zoomRatio * (cy - camera.y),
      }
    }
  }),
}))

export function worldToScreen(wx: number, wy: number, camera: Camera) {
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y,
  }
}

export function screenToWorld(sx: number, sy: number, camera: Camera) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  }
}
