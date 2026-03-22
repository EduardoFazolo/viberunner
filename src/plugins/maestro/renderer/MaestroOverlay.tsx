/**
 * MaestroOverlay — status UI + hand skeleton overlay.
 *
 * Renders:
 *   - HandOverlay: full-viewport canvas with color-coded hand skeletons
 *   - Webcam preview: small mirrored thumbnail (bottom-right)
 *   - Status pill: shows current mode (pan / zoom-in / zoom-out / idle)
 */

import React from 'react'
import { HandOverlay } from './HandOverlay'
import type { MaestroState, MaestroMode } from './useMaestro'

const MODE_LABEL: Record<MaestroMode, string> = {
  idle:      'Idle',
  pan:       'Pan',
  'zoom-in': 'Zoom in',
  'zoom-out':'Zoom out',
}

const MODE_DOT_COLOR: Record<MaestroMode, string> = {
  idle:      '#a78bfa',
  pan:       '#fb923c',
  'zoom-in': '#4ade80',
  'zoom-out':'#f87171',
}

interface MaestroOverlayProps {
  state: MaestroState
}

export function MaestroOverlay({ state }: MaestroOverlayProps): React.ReactElement | null {
  const { status, mode, hands, activeHandIndex, videoRef, connections } = state

  if (status === 'off') return null

  const activeHand = activeHandIndex !== null ? hands[activeHandIndex] : null
  const activeHandedness = activeHand?.handedness ?? null

  return (
    <>
      {/* Hidden video element for MediaPipe */}
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />

      {/* Hand skeleton overlay */}
      {status === 'ready' && hands.length > 0 && (
        <HandOverlay
          hands={hands}
          activeHandIndex={activeHandIndex}
          connections={connections}
          mode={mode}
        />
      )}

      {/* Bottom-right UI */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
        pointerEvents: 'none',
      }}>

        {/* Webcam thumbnail */}
        {status === 'ready' && (
          <div style={{
            width: 120, height: 90, borderRadius: 8, overflow: 'hidden',
            border: `1px solid ${MODE_DOT_COLOR[mode]}44`,
            background: '#000', position: 'relative',
            transition: 'border-color 0.2s',
          }}>
            <WebcamMirror videoRef={videoRef} />

            {/* Clap hint when both hands visible */}
            {hands.length === 2 && (
              <div style={{
                position: 'absolute', bottom: 4, left: 0, right: 0,
                textAlign: 'center', fontSize: 9,
                color: 'rgba(167,139,250,0.85)', letterSpacing: '0.03em',
              }}>
                clap to switch
              </div>
            )}
          </div>
        )}

        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 20,
          background: 'rgba(13,13,13,0.88)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: status === 'ready' ? MODE_DOT_COLOR[mode] : status === 'loading' ? '#fbbf24' : '#f87171',
            boxShadow: status === 'ready' ? `0 0 6px ${MODE_DOT_COLOR[mode]}` : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
          }} />

          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'inherit' }}>
            {status === 'loading' && 'Maestro loading…'}
            {status === 'error'   && 'Camera error'}
            {status === 'ready' && hands.length === 0 && 'Waiting for hand…'}
            {status === 'ready' && hands.length > 0 && (
              <>
                <span style={{ color: MODE_DOT_COLOR[mode], fontWeight: 600, transition: 'color 0.15s' }}>
                  {MODE_LABEL[mode]}
                </span>
                {activeHandedness && (
                  <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 5 }}>
                    · {activeHandedness === 'Left' ? 'R' : 'L'}
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Gesture legend overlay — top-right, fades when active */}
      {status === 'ready' && hands.length === 0 && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9997,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(13,13,13,0.75)', border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(8px)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Gestures
          </div>
          {[
            { icon: '✊', label: 'Grab (fist)', action: 'Pan' },
            { icon: '🤚', label: 'Open palm → camera', action: 'Zoom in' },
            { icon: '🫷', label: 'Back of hand', action: 'Zoom out' },
            { icon: '👏', label: 'Clap', action: 'Switch hand' },
          ].map(({ icon, label, action }) => (
            <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', marginLeft: 'auto', paddingLeft: 12 }}>{action}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Webcam mirror canvas ─────────────────────────────────────────────────────

function WebcamMirror({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const rafRef    = React.useRef<number | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function draw(): void {
      const video = videoRef.current
      if (video && video.readyState >= 2 && canvas && ctx) {
        ctx.save()
        ctx.scale(-1, 1)
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
        ctx.restore()
      }
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [videoRef])

  return <canvas ref={canvasRef} width={120} height={90} style={{ width: '100%', height: '100%', display: 'block' }} />
}
