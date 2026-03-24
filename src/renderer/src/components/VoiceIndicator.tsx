import React, { useEffect } from 'react'
import { useVoiceStore } from '../stores/voiceStore'

/**
 * Floating voice indicator — shows recording state and transcript overlay.
 * Rendered as a fixed-position overlay on the canvas.
 */
export function VoiceIndicator(): React.ReactElement | null {
  const recording = useVoiceStore((s) => s.recording)
  const transcript = useVoiceStore((s) => s.transcript)
  const transcriptVisible = useVoiceStore((s) => s.transcriptVisible)

  // Subscribe to transcripts from the main process
  useEffect(() => {
    const unsub = window.voice?.onTranscript((text) => {
      useVoiceStore.getState().stopRecording()
      useVoiceStore.getState().setTranscript(text)
    })
    return unsub
  }, [])

  if (!recording && !transcriptVisible) return null

  return (
    <>
      {/* Recording pulse badge — bottom center */}
      {recording && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 20,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10000,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 8px #ef4444',
            animation: 'voice-pulse 1.2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}>
            Listening…
          </span>
        </div>
      )}

      {/* Transcript overlay — fades in above the recording badge */}
      {transcriptVisible && transcript && (
        <div style={{
          position: 'fixed',
          bottom: recording ? 64 : 24,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 480,
          padding: '10px 18px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10000,
          pointerEvents: 'none',
          animation: 'voice-fade-in 0.2s ease-out',
        }}>
          <span style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.4,
          }}>
            {transcript}
          </span>
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes voice-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes voice-fade-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  )
}
