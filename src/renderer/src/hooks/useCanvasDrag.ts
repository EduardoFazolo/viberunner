import { useState, useEffect, useRef, useCallback } from 'react'

interface UseCanvasDragOptions {
  /** Called on every host pointermove while a drag is active. */
  onMove?: (clientX: number, clientY: number) => void
  /** Called when the pointer is released. clientX/Y are viewport coordinates. */
  onDrop: (clientX: number, clientY: number) => void
}

interface UseCanvasDragReturn {
  isDragging: boolean
  ghostX: number
  ghostY: number
  /** Begin a drag. Pass screen-space client coords to pre-position the ghost. */
  startDrag(initClientX?: number, initClientY?: number): void
  /** Shift the ghost position by the given delta (used for in-webview pointer tracking). */
  nudge(dx: number, dy: number): void
  /** Abort the active drag without triggering onDrop. */
  cancel(): void
}

/**
 * Core canvas drag hook.
 *
 * Owns: ghost position state, host pointermove/pointerup event listeners,
 * and the world-coordinate drop callback.
 *
 * The caller is responsible for: what is being dragged, the ghost visual,
 * the drop action, and any in-process (webview) pointer tracking via nudge().
 */
export function useCanvasDrag(options: UseCanvasDragOptions): UseCanvasDragReturn {
  const [ghostX, setGhostX] = useState(-9999)
  const [ghostY, setGhostY] = useState(-9999)
  const [isDragging, setIsDragging] = useState(false)

  // Track last known host-page pointer position so startDrag can pre-position the ghost
  const lastHostPos = useRef({ x: -9999, y: -9999 })

  // Keep option callbacks in refs so the effect doesn't need to re-subscribe
  const onMoveRef = useRef(options.onMove)
  const onDropRef = useRef(options.onDrop)
  useEffect(() => { onMoveRef.current = options.onMove }, [options.onMove])
  useEffect(() => { onDropRef.current = options.onDrop }, [options.onDrop])

  // Passively track the pointer on the host page (always active, no side effects)
  useEffect(() => {
    const track = (e: PointerEvent) => { lastHostPos.current = { x: e.clientX, y: e.clientY } }
    document.addEventListener('pointermove', track, { passive: true, capture: true })
    return () => document.removeEventListener('pointermove', track, { capture: true } as any)
  }, [])

  const startDrag = useCallback((initClientX?: number, initClientY?: number) => {
    setGhostX(initClientX ?? lastHostPos.current.x)
    setGhostY(initClientY ?? lastHostPos.current.y)
    setIsDragging(true)
  }, [])

  const nudge = useCallback((dx: number, dy: number) => {
    setGhostX(x => x + dx)
    setGhostY(y => y + dy)
  }, [])

  const cancel = useCallback(() => {
    setIsDragging(false)
    setGhostX(-9999)
    setGhostY(-9999)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      setGhostX(e.clientX)
      setGhostY(e.clientY)
      onMoveRef.current?.(e.clientX, e.clientY)
    }

    const onUp = (e: PointerEvent) => {
      setIsDragging(false)
      setGhostX(-9999)
      setGhostY(-9999)
      onDropRef.current(e.clientX, e.clientY)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [isDragging])

  return { isDragging, ghostX, ghostY, startDrag, nudge, cancel }
}
