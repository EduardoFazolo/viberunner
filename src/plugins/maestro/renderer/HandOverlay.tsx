/**
 * HandOverlay — renders virtual hand skeletons + pinch focus arc on a full-viewport canvas.
 *
 * Active hand color by mode:
 *   pan       → amber
 *   zoom-in   → green
 *   zoom-out  → red
 *   pinching  → cyan (with filling arc at pinch point)
 *   idle      → purple
 *
 * Inactive hand → translucent gray
 */

import React, { useRef, useEffect } from 'react'
import type { DetectedHand, MaestroMode, PinchState } from './useMaestro'

const FINGERTIPS = [4, 8, 12, 16, 20]

const MODE_COLOR: Record<MaestroMode, string> = {
  idle:      'rgba(167,139,250,1)',
  pan:       'rgba(251,146,60,1)',
  'zoom-in': 'rgba(74,222,128,1)',
  'zoom-out':'rgba(248,113,113,1)',
  pinching:  'rgba(34,211,238,1)',   // cyan
}

const MODE_LINE: Record<MaestroMode, string> = {
  idle:      'rgba(167,139,250,0.65)',
  pan:       'rgba(251,146,60,0.65)',
  'zoom-in': 'rgba(74,222,128,0.65)',
  'zoom-out':'rgba(248,113,113,0.65)',
  pinching:  'rgba(34,211,238,0.65)',
}

const MODE_GLOW: Record<MaestroMode, string> = {
  idle:      'rgba(167,139,250,0.2)',
  pan:       'rgba(251,146,60,0.2)',
  'zoom-in': 'rgba(74,222,128,0.2)',
  'zoom-out':'rgba(248,113,113,0.2)',
  pinching:  'rgba(34,211,238,0.2)',
}

interface HandOverlayProps {
  hands: DetectedHand[]
  activeHandIndex: number | null
  connections: [number, number][]
  mode: MaestroMode
  pinch: PinchState | null
}

export function HandOverlay({
  hands, activeHandIndex, connections, mode, pinch,
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

    // ── Hand skeletons ───────────────────────────────────────────────────────
    hands.forEach((hand, idx) => {
      const isActive = idx === activeHandIndex
      const lmColor  = isActive ? MODE_COLOR[mode]  : 'rgba(180,180,180,0.45)'
      const lineColor= isActive ? MODE_LINE[mode]   : 'rgba(180,180,180,0.25)'
      const glowColor= isActive ? MODE_GLOW[mode]   : 'transparent'

      ctx.strokeStyle = lineColor
      ctx.lineWidth   = isActive ? 2 : 1.5

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
        ctx.arc(x, y, isTip ? (isActive ? 6 : 4) : (isActive ? 3.5 : 2.5), 0, Math.PI * 2)
        ctx.fillStyle = isTip ? lmColor : lmColor
        ctx.fill()

        if (isActive && isTip) {
          ctx.beginPath()
          ctx.arc(x, y, 10, 0, Math.PI * 2)
          ctx.strokeStyle = glowColor
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      })

      // Mode label near wrist
      if (isActive && mode !== 'idle') {
        const wrist = hand.landmarks[0]
        const wx = (1 - wrist.x) * vw
        const wy = wrist.y * vh + 22
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = lmColor
        ctx.globalAlpha = 0.8
        const label = mode === 'pan' ? 'PAN'
          : mode === 'zoom-in' ? 'ZOOM IN'
          : mode === 'zoom-out' ? 'ZOOM OUT'
          : ''
        if (label) ctx.fillText(label, wx, wy)
        ctx.globalAlpha = 1
      }
    })

    // ── Pinch indicator ──────────────────────────────────────────────────────
    if (pinch) {
      const { phase, screenX, screenY, progress, nodeId } = pinch
      const hasTarget = nodeId !== null
      const cyan = 'rgba(34,211,238,1)'
      const cyanDim = 'rgba(34,211,238,0.35)'

      if (phase === 'primed') {
        // Small pulse: single ring acknowledging first pinch
        ctx.beginPath()
        ctx.arc(screenX, screenY, 14, 0, Math.PI * 2)
        ctx.strokeStyle = cyanDim
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(screenX, screenY, 4, 0, Math.PI * 2)
        ctx.fillStyle = cyanDim
        ctx.fill()

      } else if (phase === 'awaiting-second') {
        // Dashed double-ring: "pinch again"
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.arc(screenX, screenY, 18, 0, Math.PI * 2)
        ctx.strokeStyle = cyan
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(screenX, screenY, 10, 0, Math.PI * 2)
        ctx.strokeStyle = cyanDim
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(screenX, screenY, 4, 0, Math.PI * 2)
        ctx.fillStyle = cyan
        ctx.fill()

      } else if (phase === 'dwelling') {
        // Full arc filling toward focus
        const arcColor = hasTarget ? cyan : 'rgba(180,180,180,0.6)'
        const bgColor  = hasTarget ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.05)'
        const R = 22

        ctx.beginPath()
        ctx.arc(screenX, screenY, R, 0, Math.PI * 2)
        ctx.strokeStyle = bgColor
        ctx.lineWidth = 3
        ctx.stroke()

        if (progress > 0) {
          ctx.beginPath()
          ctx.arc(screenX, screenY, R, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
          ctx.strokeStyle = arcColor
          ctx.lineWidth = 3
          ctx.lineCap = 'round'
          ctx.stroke()
          ctx.lineCap = 'butt'
        }

        ctx.beginPath()
        ctx.arc(screenX, screenY, 5, 0, Math.PI * 2)
        ctx.fillStyle = arcColor
        ctx.fill()

        if (progress > 0.7) {
          const alpha = ((progress - 0.7) / 0.3 * 0.35).toFixed(2)
          ctx.beginPath()
          ctx.arc(screenX, screenY, R + 8, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(34,211,238,${alpha})`
          ctx.lineWidth = 6
          ctx.stroke()
        }
      }
    }
  }, [hands, activeHandIndex, connections, mode, pinch])

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
