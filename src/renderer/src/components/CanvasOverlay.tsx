import React from 'react'
import { Camera } from '../stores/cameraStore'

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasOverlay({ camera, children }: Props): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        willChange: 'transform',
        transformOrigin: '0 0',
        transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
      }}
    >
      {children}
    </div>
  )
}
