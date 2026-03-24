import { create } from 'zustand'

interface VoiceStore {
  recording: boolean
  transcript: string | null       // last received transcript (shown briefly as overlay)
  transcriptVisible: boolean      // controls overlay fade

  startRecording: () => void
  stopRecording: () => void
  setTranscript: (text: string) => void
  clearTranscript: () => void
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  recording: false,
  transcript: null,
  transcriptVisible: false,

  startRecording: () => set({ recording: true }),
  stopRecording: () => set({ recording: false }),

  setTranscript: (text) => {
    set({ transcript: text, transcriptVisible: true })
    // Auto-hide after 3 seconds
    setTimeout(() => set({ transcriptVisible: false }), 3000)
  },

  clearTranscript: () => set({ transcript: null, transcriptVisible: false }),
}))
