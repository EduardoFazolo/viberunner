import { create } from 'zustand'

export type VoiceMode = 'dictate' | 'command'

interface VoiceStore {
  recording: boolean
  mode: VoiceMode                 // 'dictate' = paste into field, 'command' = send to agent
  transcript: string | null       // last received transcript (shown briefly as overlay)
  transcriptVisible: boolean      // controls overlay fade

  startRecording: (mode: VoiceMode) => void
  stopRecording: () => void
  setTranscript: (text: string) => void
  clearTranscript: () => void
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  recording: false,
  mode: 'command',
  transcript: null,
  transcriptVisible: false,

  startRecording: (mode) => set({ recording: true, mode }),
  stopRecording: () => set({ recording: false }),

  setTranscript: (text) => {
    set({ transcript: text, transcriptVisible: true })
    // Auto-hide after 3 seconds
    setTimeout(() => set({ transcriptVisible: false }), 3000)
  },

  clearTranscript: () => set({ transcript: null, transcriptVisible: false }),
}))
