/**
 * HandOverlay — renders virtual hand skeletons on a full-viewport canvas.
 *
 * Active hand color reflects the current navigation mode:
 *   pan       → amber/orange
 *   zoom-in   → green
 *   zoom-out  → red/rose
 *   idle      → purple (default)
 *
 * Inactive hand → translucent gray
 */

import React, { useRef, useEffect } from 'react'
import type { DetectedHand, MaestroMode } from './useMaestro'

const FINGERTIPS = [4, 8, 12, 16, 20]

const MODE_COLOR: Record<MaestroMode, string> = {
  idle:      'rgba(167,139,250,1)',    // purple
  pan:       'rgba(251,146,60,1)',     // amber
  'zoom-in': 'rgba(74,222,128,1)',     // green
  'zoom-out':'rgba(248,113,113,1)',    // red
}

const MODE_GLOW: Record<MaestroMode, string> = {
  idle:      'rgba(167,139,250,0.25)',
  pan:       'rgba(251,146,60,0.25)',
  'zoom-in': 'rgba(74,222,128,0.25)',
  'zoom-out':'rgba(248,113,113,0.25)',
}

interface HandOverlayProps {
  hands: DetectedHand[]
  activeHandIndex: number | null
  connections: [number, number][]
  mode: MaestroMode
}

export function HandOverlay({ hands, activeHandIndex, connections, mode }: HandOverlayProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const vw = canvas.width
    const vh = canvas.height
    ctx.clearRect(0, 0, vw, vh)

    hands.forEach((hand, idx) => {
      const isActive = idx === activeHandIndex
      const lmColor  = isActive ? MODE_COLOR[mode]       : 'rgba(180,180,180,0.45)'
      const lineColor= isActive ? lmColor.replace(',1)',',0.65)') : 'rgba(180,180,180,0.25)'
      const tipColor = isActive ? lmColor                : 'rgba(220,220,220,0.5)'
      const glowColor= isActive ? MODE_GLOW[mode]        : 'transparent'

      // ── Connections ──────────────────────────────────────────────────────
      ctx.strokeStyle = lineColor
      ctx.lineWidth   = isActive ? 2 : 1.5

      for (const [a, b] of connections) {
        const lmA = hand.landmarks[a], lmB = hand.landmarks[b]
        if (!lmA || !lmB) continue
        ctx.beginPath()
        ctx.moveTo((1 - lmA.x) * vw, lmA.y * vh)
        ctx.lineTo((1 - lmB.x) * vw, lmB.y * vh)
        ctx.stroke()
      }

      // ── Landmarks ────────────────────────────────────────────────────────
      hand.landmarks.forEach((lm, lmIdx) => {
        const x = (1 - lm.x) * vw
        const y = lm.y * vh
        const isTip = FINGERTIPS.includes(lmIdx)
        const r = isTip ? (isActive ? 6 : 4) : (isActive ? 3.5 : 2.5)

        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = isTip ? tipColor : lmColor
        ctx.fill()

        if (isActive && isTip) {
          ctx.beginPath()
          ctx.arc(x, y, 10, 0, Math.PI * 2)
          ctx.strokeStyle = glowColor
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      })

      // ── Wrist label for active hand ──────────────────────────────────────
      if (isActive && mode !== 'idle') {
        const wrist = hand.landmarks[0]
        const wx = (1 - wrist.x) * vw
        const wy = wrist.y * vh + 22

        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = lmColor
        ctx.globalAlpha = 0.8
        ctx.fillText(
          mode === 'pan' ? 'PAN' : mode === 'zoom-in' ? 'ZOOM IN' : 'ZOOM OUT',
          wx, wy,
        )
        ctx.globalAlpha = 1
      }
    })
  }, [hands, activeHandIndex, connections, mode])

  // ── Resize to viewport ───────────────────────────────────────────────────
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
