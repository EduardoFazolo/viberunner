import { useMemo } from 'react'
import { Camera } from '../stores/cameraStore'
import { NodeData } from '../stores/nodeStore'
import { pluginRegistry } from '../../../plugins/types'

const CULL_PADDING_SCREEN = 300 // screen-space px padding to prevent pop-in (constant regardless of zoom)

export function useVisibleNodes(nodes: Map<string, NodeData>, camera: Camera): NodeData[] {
  return useMemo(() => {
    const { x, y, zoom } = camera
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Convert screen-space padding to world-space so it's consistent at all zoom levels
    const pad = CULL_PADDING_SCREEN / zoom

    // Viewport rect in world space (with padding)
    const left = (-x / zoom) - pad
    const top = (-y / zoom) - pad
    const right = (vw - x) / zoom + pad
    const bottom = (vh - y) / zoom + pad

    return Array.from(nodes.values()).filter((node) => {
      // Never cull nodes that own live processes or webviews
      if (node.type === 'terminal') return true
      if (node.type === 'browser') return true
      if (pluginRegistry.get(node.type)?.keepAlive) return true

      return (
        node.x < right &&
        node.x + node.width > left &&
        node.y < bottom &&
        node.y + node.height > top
      )
    })
  }, [nodes, camera])
}
