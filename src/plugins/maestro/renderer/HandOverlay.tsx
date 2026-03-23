/**
 * HandOverlay — renders hand skeletons + virtual cursor on a full-viewport canvas.
 *
 * The user's right hand (MediaPipe 'Left') is the mouse hand and is highlighted
 * when gestures are active. All other hands are shown in translucent gray.
 *
 * Cursor indicator is drawn at mousePos when gestures are active.
 */

import React, { useRef, useEffect } from 'react'
import type { DetectedHand, MaestroMode } from './useMaestro'

const FINGERTIPS = [4, 8, 12, 16, 20]

const MODE_COLOR: Record<MaestroMode, string> = {
  disabled: 'rgba(100,116,139,0.6)',
  idle:     'rgba(167,139,250,1)',
  moving:   'rgba(74,222,128,1)',
  clicking: 'rgba(251,191,36,1)',
  dragging: 'rgba(251,146,60,1)',
  zooming:  'rgba(34,211,238,1)',
}

const MODE_LINE: Record<MaestroMode, string> = {
  disabled: 'rgba(100,116,139,0.3)',
  idle:     'rgba(167,139,250,0.65)',
  moving:   'rgba(74,222,128,0.65)',
  clicking: 'rgba(251,191,36,0.65)',
  dragging: 'rgba(251,146,60,0.65)',
  zooming:  'rgba(34,211,238,0.65)',
}

const MODE_GLOW: Record<MaestroMode, string> = {
  disabled: 'transparent',
  idle:     'rgba(167,139,250,0.2)',
  moving:   'rgba(74,222,128,0.2)',
  clicking: 'rgba(251,191,36,0.2)',
  dragging: 'rgba(251,146,60,0.2)',
  zooming:  'rgba(34,211,238,0.2)',
}

interface HandOverlayProps {
  hands: DetectedHand[]
  connections: [number, number][]
  mode: MaestroMode
  gesturesActive: boolean
  mousePos: { x: number; y: number } | null
}

export function HandOverlay({
  hands, connections, mode, gesturesActive, mousePos,
}: HandOverlayProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const vw = canvas.width
    const vh = canvas.height
    ctx.clearRect(0, 0, vw, vh)

    // ── Hand skeletons ───────────────────────────────────────────────────
    hands.forEach((hand) => {
      // User's right hand = MediaPipe 'Right'
      const isMouseHand = hand.handedness === 'Right' && gesturesActive
      const lmColor   = isMouseHand ? MODE_COLOR[mode]  : 'rgba(180,180,180,0.45)'
      const lineColor = isMouseHand ? MODE_LINE[mode]   : 'rgba(180,180,180,0.25)'
      const glowColor = isMouseHand ? MODE_GLOW[mode]   : 'transparent'

      ctx.strokeStyle = lineColor
      ctx.lineWidth   = isMouseHand ? 2 : 1.5

      for (const [a, b] of connections) {
        const lA = hand.landmarks[a], lB = hand.landmarks[b]
        if (!lA || !lB) continue
        ctx.beginPath()
        ctx.moveTo((1 - lA.x) * vw, lA.y * vh)
        ctx.lineTo((1 - lB.x) * vw, lB.y * vh)
        ctx.stroke()
      }

      hand.landmarks.forEach((lm, lmIdx) => {
        const x = (1 - lm.x) * vw
        const y = lm.y * vh
        const isTip = FINGERTIPS.includes(lmIdx)
        ctx.beginPath()
        ctx.arc(x, y, isTip ? (isMouseHand ? 6 : 4) : (isMouseHand ? 3.5 : 2.5), 0, Math.PI * 2)
        ctx.fillStyle = lmColor
        ctx.fill()

        if (isMouseHand && isTip) {
          ctx.beginPath()
          ctx.arc(x, y, 10, 0, Math.PI * 2)
          ctx.strokeStyle = glowColor
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      })

      // Mode label near wrist (mouse hand only, when actively doing something)
      if (isMouseHand && mode !== 'idle' && mode !== 'disabled') {
        const wrist = hand.landmarks[0]
        const wx = (1 - wrist.x) * vw
        const wy = wrist.y * vh + 22
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = lmColor
        ctx.globalAlpha = 0.8
        const label = mode === 'moving'   ? 'MOUSE'
                    : mode === 'clicking'  ? 'CLICK'
                    : mode === 'dragging'  ? 'DRAG'
                    : ''
        if (label) ctx.fillText(label, wx, wy)
        ctx.globalAlpha = 1
      }
    })

    // ── Virtual cursor indicator ──────────────────────────────────────────
    if (gesturesActive && mousePos) {
      const { x, y } = mousePos
      const cursorColor = MODE_COLOR[mode]
      const cursorAlpha = mode === 'dragging' ? 1 : 0.8

      ctx.globalAlpha = cursorAlpha

      // Crosshair
      const size = mode === 'dragging' ? 14 : 10
      ctx.strokeStyle = cursorColor
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x - size, y); ctx.lineTo(x + size, y)
      ctx.moveTo(x, y - size); ctx.lineTo(x, y + size)
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(x, y, mode === 'dragging' ? 4 : 3, 0, Math.PI * 2)
      ctx.fillStyle = cursorColor
      ctx.fill()

      // Outer ring (pulsing feel for drag)
      if (mode === 'dragging') {
        ctx.beginPath()
        ctx.arc(x, y, 18, 0, Math.PI * 2)
        ctx.strokeStyle = cursorColor
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Click flash
      if (mode === 'clicking') {
        ctx.beginPath()
        ctx.arc(x, y, 16, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(251,191,36,0.5)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }
  }, [hands, connections, mode, gesturesActive, mousePos])

  // ── Resize to viewport ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = (): void => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9998 }}
    />
  )
}
