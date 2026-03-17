import React, { useRef } from 'react'
import { Camera, screenToWorld } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator
} from './ui/context-menu'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'

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
          <span style={{ flex: 1 }}>New Terminal</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘T</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('browser', clickWorldPos.current.x - 400, clickWorldPos.current.y - 300)}>
          <span style={{ flex: 1 }}>New Browser</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘B</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('notion', clickWorldPos.current.x - 450, clickWorldPos.current.y - 350)}>
          New Notion
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => fitAllNodes(useNodeStore.getState().nodes)}>
          <span style={{ flex: 1 }}>Fit All Nodes</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘0</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
