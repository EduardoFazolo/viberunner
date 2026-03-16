import { useEffect } from 'react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'

interface Options {
  onSearch: () => void
  onSettings: () => void
}

export function useKeyboardShortcuts({ onSearch, onSettings }: Options): void {
  useEffect(() => {
    const unsub = window.app.onShortcut((name) => {
      switch (name) {
        case 'newTerminal': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          useNodeStore.getState().add('terminal', wx - 300, wy - 200)
          break
        }
        case 'newBrowser': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          useNodeStore.getState().add('browser', wx - 400, wy - 300)
          break
        }
        case 'fitAll':
          fitAllNodes(useNodeStore.getState().nodes)
          break
        case 'zoomIn':
          useCameraStore.getState().zoomByFactor(1.25)
          break
        case 'zoomOut':
          useCameraStore.getState().zoomByFactor(1 / 1.25)
          break
        case 'search':
          onSearch()
          break
        case 'settings':
          onSettings()
          break
      }
    })
    return unsub
  }, [onSearch, onSettings])
}
