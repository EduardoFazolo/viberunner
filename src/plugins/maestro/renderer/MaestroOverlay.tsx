/**
 * MaestroOverlay — status UI + hand skeleton overlay.
 *
 * Renders:
 *   - HandOverlay: full-viewport canvas with hand skeletons + cursor
 *   - Webcam preview: small mirrored thumbnail (bottom-right)
 *   - Status pill: shows current mode (moving / clicking / dragging / idle / disabled)
 */

import React from 'react'
import { HandOverlay } from './HandOverlay'
import type { MaestroState, MaestroMode } from './useMaestro'

const MODE_LABEL: Record<MaestroMode, string> = {
  disabled: 'Disabled',
  idle:     'Idle',
  moving:   'Moving',
  clicking: 'Click',
  dragging: 'Dragging',
}

const MODE_DOT_COLOR: Record<MaestroMode, string> = {
  disabled: '#64748b',
  idle:     '#a78bfa',
  moving:   '#4ade80',
  clicking: '#fbbf24',
  dragging: '#fb923c',
}

interface MaestroOverlayProps {
  state: MaestroState
}

export function MaestroOverlay({ state }: MaestroOverlayProps): React.ReactElement | null {
  const { status, mode, gesturesActive, hands, mousePos, videoRef, connections } = state

  if (status === 'off') return null

  return (
    <>
      {/* Hidden video element for MediaPipe */}
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />

      {/* Hand skeleton overlay + cursor */}
      {status === 'ready' && hands.length > 0 && (
        <HandOverlay
          hands={hands}
          connections={connections}
          mode={mode}
          gesturesActive={gesturesActive}
          mousePos={mousePos}
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

            {/* Toggle hint */}
            {!gesturesActive && (
              <div style={{
                position: 'absolute', bottom: 4, left: 0, right: 0,
                textAlign: 'center', fontSize: 9,
                color: 'rgba(167,139,250,0.85)', letterSpacing: '0.03em',
              }}>
                show both open palms for 1.5s
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
            {status === 'loading' && 'Maestro loading\u2026'}
            {status === 'error'   && 'Camera error'}
            {status === 'ready' && hands.length === 0 && (
              gesturesActive ? 'Waiting for hand\u2026' : 'Gestures off \u2014 both open palms to activate'
            )}
            {status === 'ready' && hands.length > 0 && (
              <span style={{ color: MODE_DOT_COLOR[mode], fontWeight: 600, transition: 'color 0.15s' }}>
                {MODE_LABEL[mode]}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Gesture legend — top-right, shown when gestures active and no hands */}
      {status === 'ready' && gesturesActive && hands.length === 0 && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9997,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(13,13,13,0.75)', border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(8px)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Right hand = Mouse
          </div>
          {[
            { icon: '\u{1F90F}', label: 'Pinch + release', action: 'Click' },
            { icon: '\u{1F90F}', label: 'Pinch + hold', action: 'Drag' },
            { icon: '\u{1F590}\u{1F590}', label: 'Both open palms (1.5s)', action: 'Toggle' },
          ].map(({ icon, label, action }) => (
            <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, minWidth: 24 }}>{icon}</span>
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
