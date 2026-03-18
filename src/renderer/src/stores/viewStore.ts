import { create } from 'zustand'

export interface ViewInstance {
  id: string
  type: string
  label: string
  closeable: boolean
}

interface ViewStore {
  instances: ViewInstance[]
  activeId: string
  activate: (id: string) => void
  open: (instance: ViewInstance) => void
  close: (id: string) => void
}

export const useViewStore = create<ViewStore>((set, get) => ({
  instances: [
    { id: 'canvas', type: 'canvas', label: 'Canvas', closeable: false },
  ],
  activeId: 'canvas',

  activate: (id) => {
    if (get().instances.find((i) => i.id === id)) set({ activeId: id })
  },

  open: (instance) => {
    if (get().instances.find((i) => i.id === instance.id)) {
      set({ activeId: instance.id })
      return
    }
    set((s) => ({ instances: [...s.instances, instance], activeId: instance.id }))
  },

  close: (id) => {
    const { instances, activeId } = get()
    const inst = instances.find((i) => i.id === id)
    if (!inst?.closeable) return
    const remaining = instances.filter((i) => i.id !== id)
    const idx = instances.findIndex((i) => i.id === id)
    const newActiveId = activeId === id
      ? (remaining[Math.max(0, idx - 1)]?.id ?? 'canvas')
      : activeId
    set({ instances: remaining, activeId: newActiveId })
  },
}))
