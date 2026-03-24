import React, { useEffect } from 'react'
import { useVoiceStore } from '../stores/voiceStore'
import { useNodeStore } from '../stores/nodeStore'
import { pasteIntoBrowser } from '../browserRegistry'

/** Insert text into the currently focused input/textarea/contenteditable in the main renderer. */
function insertIntoActiveElement(text: string): void {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    el.setRangeText(text, start, end, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (el?.getAttribute('contenteditable')) {
    document.execCommand('insertText', false, text)
  }
}

/**
 * Floating voice indicator — shows recording state, transcript overlay, and agent status.
 * Handles two modes:
 *   - dictate (Cmd+Shift+V): inserts transcript into the focused input/textarea
 *   - command (Cmd+Shift+M): sends transcript to Claude agent which executes MCP tools
 */
export function VoiceIndicator(): React.ReactElement | null {
  const recording = useVoiceStore((s) => s.recording)
  const mode = useVoiceStore((s) => s.mode)
  const transcript = useVoiceStore((s) => s.transcript)
  const transcriptVisible = useVoiceStore((s) => s.transcriptVisible)
  const agentState = useVoiceStore((s) => s.agentState)
  const agentMessage = useVoiceStore((s) => s.agentMessage)

  // Subscribe to transcripts from the main process
  useEffect(() => {
    const unsub = window.voice?.onTranscript((text) => {
      const { mode: currentMode } = useVoiceStore.getState()
      useVoiceStore.getState().stopRecording()
      useVoiceStore.getState().setTranscript(text)

      if (currentMode === 'dictate') {
        // Try pasting into focused browser node first (WebContentsView/webview)
        const focusedId = useNodeStore.getState().focusedNodeId
        if (focusedId) {
          pasteIntoBrowser(focusedId, text).then((handled) => {
            if (!handled) insertIntoActiveElement(text)
          })
        } else {
          insertIntoActiveElement(text)
        }
      } else {
        // Command mode — send to voice agent
        // Don't auto-hide transcript in command mode (agent status will replace it)
        useVoiceStore.getState().setAgentStatus('thinking')
        window.voice?.runAgent(text).catch((err) => {
          useVoiceStore.getState().setAgentStatus('error', err?.message ?? 'Agent failed')
        })
      }
    })
    return unsub
  }, [])

  // Subscribe to agent status updates from main process
  useEffect(() => {
    const unsub = window.voice?.onAgentStatus((status) => {
      useVoiceStore.getState().setAgentStatus(
        status.state as any,
        status.message,
      )
    })
    return unsub
  }, [])

  const showBadge = recording || agentState === 'thinking' || agentState === 'executing'
  const showTranscript = transcriptVisible && transcript
  const showAgentMessage = (agentState === 'done' || agentState === 'error') && agentMessage

  if (!showBadge && !showTranscript && !showAgentMessage) return null

  // Badge config
  let badgeLabel = ''
  let dotColor = '#ef4444'
  if (recording) {
    badgeLabel = mode === 'dictate' ? 'Dictating…' : 'Listening…'
    dotColor = mode === 'dictate' ? '#f59e0b' : '#ef4444'
  } else if (agentState === 'thinking') {
    badgeLabel = 'Thinking…'
    dotColor = '#a78bfa'
  } else if (agentState === 'executing') {
    badgeLabel = agentMessage ? `Running ${agentMessage}` : 'Executing…'
    dotColor = '#38bdf8'
  }

  return (
    <>
      {/* Status badge — bottom center */}
      {showBadge && (
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
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
            animation: 'voice-pulse 1.2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}>
            {badgeLabel}
          </span>
        </div>
      )}

      {/* Transcript overlay */}
      {showTranscript && (
        <div style={{
          position: 'fixed',
          bottom: showBadge ? 64 : 24,
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

      {/* Agent response / error overlay */}
      {showAgentMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 480,
          padding: '10px 18px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${agentState === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          zIndex: 10000,
          pointerEvents: 'none',
          animation: 'voice-fade-in 0.2s ease-out',
        }}>
          <span style={{
            fontSize: 13,
            color: agentState === 'error' ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.8)',
            lineHeight: 1.4,
          }}>
            {agentMessage}
          </span>
        </div>
      )}

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
