import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCameraStore, updateCursorPos } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useNodeStore } from '../stores/nodeStore'
import { GridRenderer } from './GridRenderer'
import { CanvasOverlay } from './CanvasOverlay'
import { NodeLayer } from './NodeLayer'
import { CanvasContextMenu } from './CanvasContextMenu'

export function Canvas(): React.ReactElement {
  const { camera, pan, zoomAt } = useCameraStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  // Attach wheel as non-passive so preventDefault works
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const style = useSettingsStore.getState().settings.navStyle
      if (style === 'trackpad') {
        zoomAt(localX, localY, e.deltaY)
      } else {
        if (e.ctrlKey || e.metaKey) {
          zoomAt(localX, localY, e.deltaY)
        } else {
          pan(-e.deltaX, -e.deltaY)
        }
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pan, zoomAt])

  const startPan = useCallback((e: React.PointerEvent) => {
    isPanningRef.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Clicking the canvas background deactivates any focused node.
    // Nodes call stopPropagation on pointerDown, so this only fires on empty space.
    useNodeStore.getState().setFocusedNodeId(null)
    if (e.button === 1 || e.button === 0) {
      startPan(e)
    }
  }, [startPan])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) updateCursorPos(e.clientX - rect.left, e.clientY - rect.top)
    if (!isPanningRef.current) return
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [pan])

  const onPointerUp = useCallback(() => {
    isPanningRef.current = false
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = true; setSpaceHeld(true) }
  }, [])

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = false; setSpaceHeld(false) }
  }, [])

  return (
    <CanvasContextMenu camera={camera}>
      <div
        ref={rootRef}
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          cursor: spaceHeld ? 'grab' : 'default',
          outline: 'none',
        }}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <GridRenderer camera={camera} />
        <CanvasOverlay camera={camera}>
          <NodeLayer />
        </CanvasOverlay>

      </div>
    </CanvasContextMenu>
  )
}
