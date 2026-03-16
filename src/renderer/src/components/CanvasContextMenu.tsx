import React, { useRef } from 'react'
import { Camera, screenToWorld } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator
} from './ui/context-menu'
import { useCameraStore } from '../stores/cameraStore'

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasContextMenu({ children }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const clickWorldPos = useRef({ x: 0, y: 0 })

  return (
    <ContextMenu>
      <ContextMenuTrigger
        onContextMenu={(e: React.MouseEvent) => {
          const camera = useCameraStore.getState().camera
          clickWorldPos.current = screenToWorld(e.clientX, e.clientY, camera)
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => add('terminal', clickWorldPos.current.x - 300, clickWorldPos.current.y - 200)}>
          New Terminal
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('browser', clickWorldPos.current.x - 400, clickWorldPos.current.y - 300)}>
          New Browser
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          const { nodes } = useNodeStore.getState()
          if (nodes.size === 0) return
          const all = Array.from(nodes.values())
          const minX = Math.min(...all.map(n => n.x))
          const minY = Math.min(...all.map(n => n.y))
          const maxX = Math.max(...all.map(n => n.x + n.width))
          const maxY = Math.max(...all.map(n => n.y + n.height))
          const pw = window.innerWidth, ph = window.innerHeight
          const zoom = Math.min(pw / (maxX - minX + 100), ph / (maxY - minY + 100), 1)
          useCameraStore.getState().setCamera({
            zoom,
            x: (pw - (maxX + minX) * zoom) / 2,
            y: (ph - (maxY + minY) * zoom) / 2,
          })
        }}>
          Fit All Nodes
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
