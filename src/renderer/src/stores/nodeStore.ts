import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type NodeType = 'terminal' | 'browser' | 'note' | 'files' | 'notion' | 'trello' | 'claude' | 'monaco'

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
  contentScale: number
  props: Record<string, unknown>
}

interface NodeStore {
  // Active workspace nodes (for all existing consumers — API unchanged)
  nodes: Map<string, NodeData>
  // All workspaces' nodes — kept alive so components never unmount on workspace switch
  workspaceNodes: Map<string, Map<string, NodeData>>
  activeWorkspaceId: string

  // Workspace management
  loadWorkspace: (wsId: string, nodes: Map<string, NodeData>) => void

  // Unchanged public API
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
  files: { width: 700, height: 480 },
  notion: { width: 900, height: 700 },
  trello: { width: 900, height: 700 },
  claude: { width: 700, height: 480 },
  monaco: { width: 1000, height: 640 },
}

const DEFAULT_TITLES: Record<NodeType, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  note: 'Note',
  files: 'Files',
  notion: 'Notion',
  trello: 'Trello',
  claude: 'Claude',
  monaco: 'Untitled',
}

// Sync helper: after mutating `nodes`, write it back into workspaceNodes
function syncBack(nodes: Map<string, NodeData>, s: NodeStore): Partial<NodeStore> {
  const workspaceNodes = new Map(s.workspaceNodes)
  workspaceNodes.set(s.activeWorkspaceId, nodes)
  return { nodes, workspaceNodes }
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: new Map(),
  workspaceNodes: new Map(),
  activeWorkspaceId: '',
  focusedNodeId: null,

  loadWorkspace: (wsId, nodes) => set((s) => {
    const workspaceNodes = new Map(s.workspaceNodes)
    workspaceNodes.set(wsId, nodes)
    return { nodes, workspaceNodes, activeWorkspaceId: wsId, focusedNodeId: null }
  }),

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
      contentScale: 1,
      props,
    }
    set((s) => {
      const nodes = new Map(s.nodes)
      nodes.set(id, node)
      return syncBack(nodes, s)
    })
    return node
  },

  remove: (id) => set((s) => {
    const nodes = new Map(s.nodes)
    nodes.delete(id)
    return syncBack(nodes, s)
  }),

  update: (id, patch) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, ...patch })
    return syncBack(nodes, s)
  }),

  bringToFront: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, zIndex: get().getMaxZIndex() + 1 })
    return syncBack(nodes, s)
  }),

  sendToBack: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    const minZ = Math.min(...Array.from(s.nodes.values()).map(n => n.zIndex))
    nodes.set(id, { ...node, zIndex: minZ - 1 })
    return syncBack(nodes, s)
  }),

  getMaxZIndex: () => {
    const { nodes } = get()
    if (nodes.size === 0) return 0
    return Math.max(...Array.from(nodes.values()).map(n => n.zIndex))
  },
}))
