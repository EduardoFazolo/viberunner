import { useMemo } from 'react'
import { Camera } from '../stores/cameraStore'
import { NodeData } from '../stores/nodeStore'
import { pluginRegistry } from '../../../plugins/types'

const CULL_PADDING = 200 // world-space px padding to prevent pop-in

export function useVisibleNodes(nodes: Map<string, NodeData>, camera: Camera): NodeData[] {
  return useMemo(() => {
    const { x, y, zoom } = camera
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Viewport rect in world space (with padding)
    const left = (-x / zoom) - CULL_PADDING
    const top = (-y / zoom) - CULL_PADDING
    const right = (vw - x) / zoom + CULL_PADDING
    const bottom = (vh - y) / zoom + CULL_PADDING

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
