import { create } from 'zustand'

interface MaestroSettings {
  enabled: boolean
}

interface MaestroStore {
  settings: MaestroSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<MaestroSettings>) => Promise<void>
}

const DEFAULTS: MaestroSettings = { enabled: false }
const STORAGE_KEY = 'maestro-settings'

export const useMaestroStore = create<MaestroStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const raw = await window.appState.get(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MaestroSettings>
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
      await window.appState.set(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  },
}))
