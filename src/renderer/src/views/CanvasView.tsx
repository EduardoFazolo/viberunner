import React from 'react'
import { Canvas } from '../components/Canvas'

export function CanvasView(): React.ReactElement {
  return (
    <div
      data-canvas-root
      style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}
    >
      <Canvas />
    </div>
  )
}
