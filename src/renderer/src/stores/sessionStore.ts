import { create } from 'zustand'

export interface BrowserSession {
  id: string
  name: string
  createdAt: number
}

interface SessionStore {
  sessions: BrowserSession[]
  loaded: boolean
  load: () => Promise<void>
  add: (name: string) => Promise<BrowserSession>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const rows = await window.sessions.getAll()
    set({ sessions: rows, loaded: true })
  },

  add: async (name: string) => {
    const session: BrowserSession = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    }
    await window.sessions.save(session)
    set((s) => ({ sessions: [...s.sessions, session] }))
    return session
  },

  rename: async (id: string, name: string) => {
    const existing = get().sessions.find((s) => s.id === id)
    if (!existing) return
    const updated = { ...existing, name }
    await window.sessions.save(updated)
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? updated : x)) }))
  },

  remove: async (id: string) => {
    await window.sessions.delete(id)
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }))
  },
}))
