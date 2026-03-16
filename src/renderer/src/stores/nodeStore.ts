import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type NodeType = 'terminal' | 'browser' | 'note'

export interface NodeData {
  id: string
  type: NodeType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: boolean
  props: Record<string, unknown>
}

interface NodeStore {
  nodes: Map<string, NodeData>
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  add: (type: NodeType, x: number, y: number, props?: Record<string, unknown>) => NodeData
  remove: (id: string) => void
  update: (id: string, patch: Partial<NodeData>) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  getMaxZIndex: () => number
}

const DEFAULT_SIZES: Record<NodeType, { width: number; height: number }> = {
  terminal: { width: 600, height: 400 },
  browser: { width: 800, height: 600 },
  note: { width: 300, height: 200 },
}

const DEFAULT_TITLES: Record<NodeType, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  note: 'Note',
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: new Map(),
  focusedNodeId: null,
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  add: (type, x, y, props = {}) => {
    const id = nanoid()
    const zIndex = get().getMaxZIndex() + 1
    const node: NodeData = {
      id, type, x, y,
      ...DEFAULT_SIZES[type],
      zIndex,
      title: DEFAULT_TITLES[type],
      minimized: false,
      props,
    }
    set((s) => {
      const nodes = new Map(s.nodes)
      nodes.set(id, node)
      return { nodes }
    })
    return node
  },

  remove: (id) => set((s) => {
    const nodes = new Map(s.nodes)
    nodes.delete(id)
    return { nodes }
  }),

  update: (id, patch) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, ...patch })
    return { nodes }
  }),

  bringToFront: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, zIndex: get().getMaxZIndex() + 1 })
    return { nodes }
  }),

  sendToBack: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    const minZ = Math.min(...Array.from(s.nodes.values()).map(n => n.zIndex))
    nodes.set(id, { ...node, zIndex: minZ - 1 })
    return { nodes }
  }),

  getMaxZIndex: () => {
    const { nodes } = get()
    if (nodes.size === 0) return 0
    return Math.max(...Array.from(nodes.values()).map(n => n.zIndex))
  },
}))
