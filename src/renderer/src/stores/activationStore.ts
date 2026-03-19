import { create } from 'zustand'

interface ActivationState {
  activated: Record<string, true>
  activate: (nodeId: string) => void
  isActivated: (nodeId: string) => boolean
}

export const useActivationStore = create<ActivationState>((set, get) => ({
  activated: {},
  activate: (nodeId) => {
    if (get().activated[nodeId]) return
    set((s) => ({ activated: { ...s.activated, [nodeId]: true } }))
  },
  isActivated: (nodeId) => !!get().activated[nodeId],
}))
