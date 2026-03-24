import { create } from 'zustand'

export interface Settings {
  shell: string                          // default shell for new terminals (empty = use system default)
  fontSize: number                       // xterm.js font size
  navStyle: 'default' | 'trackpad'      // canvas navigation style
  voiceApiKey: string                    // API key for voice commands agent
  voiceBaseUrl: string                   // OpenAI-compatible base URL
  voiceModel: string                     // model ID
}

const DEFAULTS: Settings = {
  shell: '',
  fontSize: 13,
  navStyle: 'default',
  voiceApiKey: '',
  voiceBaseUrl: 'https://api.moonshot.ai/v1',
  voiceModel: 'kimi-k2-turbo-preview',
}

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await window.appState.get('settings')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>
        set({ settings: { ...DEFAULTS, ...parsed }, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    try {
      await window.appState.set('settings', JSON.stringify(next))
    } catch {}
  },
}))
