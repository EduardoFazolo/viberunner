import { create } from 'zustand'

interface ActivityStore {
  activeNodeIds: Set<string>
  markActive: (nodeId: string) => void
  markIdle: (nodeId: string) => void
}

// Per-node idle timers — outside store to avoid serialization issues
const _idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const IDLE_DELAY_MS = 30000

export const useActivityStore = create<ActivityStore>((set) => ({
  activeNodeIds: new Set(),

  markActive: (nodeId) => {
    // Reset idle timer
    const existing = _idleTimers.get(nodeId)
    if (existing) clearTimeout(existing)

    set((s) => {
      if (s.activeNodeIds.has(nodeId)) return s
      const next = new Set(s.activeNodeIds)
      next.add(nodeId)
      return { activeNodeIds: next }
    })

    const timer = setTimeout(() => {
      _idleTimers.delete(nodeId)
      set((s) => {
        if (!s.activeNodeIds.has(nodeId)) return s
        const next = new Set(s.activeNodeIds)
        next.delete(nodeId)
        return { activeNodeIds: next }
      })
    }, IDLE_DELAY_MS)
    _idleTimers.set(nodeId, timer)
  },

  markIdle: (nodeId) => {
    const existing = _idleTimers.get(nodeId)
    if (existing) { clearTimeout(existing); _idleTimers.delete(nodeId) }
    set((s) => {
      if (!s.activeNodeIds.has(nodeId)) return s
      const next = new Set(s.activeNodeIds)
      next.delete(nodeId)
      return { activeNodeIds: next }
    })
  },
}))
