import { create } from 'zustand'

export interface NodeActivity {
  label?: string
  startedAt: number
}

interface ActivityStore {
  activeNodes: Map<string, NodeActivity>
  // Backwards-compatible shim (TerminalNode / other callers may use activeNodeIds)
  activeNodeIds: Set<string>
  markActive: (nodeId: string, label?: string) => void
  markIdle: (nodeId: string) => void
}

// Per-node idle timers — outside store to avoid serialization issues
const _idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const IDLE_DELAY_MS = 30_000

export const useActivityStore = create<ActivityStore>((set) => ({
  activeNodes: new Map(),
  activeNodeIds: new Set(),

  markActive: (nodeId, label) => {
    const existing = _idleTimers.get(nodeId)
    if (existing) clearTimeout(existing)

    set((s) => {
      const prev = s.activeNodes.get(nodeId)
      const next = new Map(s.activeNodes)
      next.set(nodeId, { label, startedAt: prev?.startedAt ?? Date.now() })
      const ids = new Set(next.keys())
      return { activeNodes: next, activeNodeIds: ids }
    })

    const timer = setTimeout(() => {
      _idleTimers.delete(nodeId)
      set((s) => {
        const next = new Map(s.activeNodes)
        next.delete(nodeId)
        const ids = new Set(next.keys())
        return { activeNodes: next, activeNodeIds: ids }
      })
    }, IDLE_DELAY_MS)
    _idleTimers.set(nodeId, timer)
  },

  markIdle: (nodeId) => {
    const existing = _idleTimers.get(nodeId)
    if (existing) { clearTimeout(existing); _idleTimers.delete(nodeId) }
    set((s) => {
      if (!s.activeNodes.has(nodeId)) return s
      const next = new Map(s.activeNodes)
      next.delete(nodeId)
      const ids = new Set(next.keys())
      return { activeNodes: next, activeNodeIds: ids }
    })
  },
}))
