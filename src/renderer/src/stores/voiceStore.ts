import { create } from 'zustand'

export type VoiceMode = 'dictate' | 'command'
export type AgentState = 'idle' | 'thinking' | 'executing' | 'done' | 'error'

interface VoiceStore {
  recording: boolean
  mode: VoiceMode                 // 'dictate' = paste into field, 'command' = send to agent
  transcript: string | null       // last received transcript (shown briefly as overlay)
  transcriptVisible: boolean      // controls overlay fade
  agentState: AgentState
  agentMessage: string | null     // text response or error message

  startRecording: (mode: VoiceMode) => void
  stopRecording: () => void
  setTranscript: (text: string) => void
  clearTranscript: () => void
  setAgentStatus: (state: AgentState, message?: string) => void
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  recording: false,
  mode: 'command',
  transcript: null,
  transcriptVisible: false,
  agentState: 'idle',
  agentMessage: null,

  startRecording: (mode) => set({ recording: true, mode }),
  stopRecording: () => set({ recording: false }),

  setTranscript: (text) => {
    set({ transcript: text, transcriptVisible: true })
    // In command mode, transcript stays visible until agent finishes (cleared by setAgentStatus done/error)
    // In dictate mode, auto-hide after 3 seconds
    const { mode } = get()
    if (mode === 'dictate') {
      setTimeout(() => set({ transcriptVisible: false }), 3000)
    }
  },

  clearTranscript: () => set({ transcript: null, transcriptVisible: false }),

  setAgentStatus: (state, message) => {
    set({ agentState: state, agentMessage: message ?? null })
    if (state === 'done' || state === 'error') {
      // Hide transcript now that agent is done, auto-clear everything after 3s
      set({ transcriptVisible: false })
      setTimeout(() => set({ agentState: 'idle', agentMessage: null }), 3000)
    }
  },
}))
