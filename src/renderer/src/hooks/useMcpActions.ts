import { useEffect } from 'react'
import { useNodeStore, type NodeType } from '../stores/nodeStore'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'
import { useWorkspaceStore, getActiveWorkspace } from '../stores/workspaceStore'
import { fitAllNodes, computeFitCamera, getCanvasRect } from '../utils/canvasUtils'
import { loadWorkspaceCanvas } from './useWorkspaceInit'

// ---------------------------------------------------------------------------
// Arrange algorithms
// ---------------------------------------------------------------------------

const GRID_GAP = 40

interface ArrangeNode {
  id: string
  width: number
  height: number
  sortKey: number
  groupKey: string
}

function arrangeGrid(items: ArrangeNode[]): Map<string, { x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)))
  const result = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowHeight = 0

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % cols === 0) {
      x = 0
      y += rowHeight + GRID_GAP
      rowHeight = 0
    }
    result.set(items[i].id, { x, y })
    x += items[i].width + GRID_GAP
    rowHeight = Math.max(rowHeight, items[i].height)
  }
  return result
}

function arrangeByGroup(items: ArrangeNode[]): Map<string, { x: number; y: number }> {
  // Group items, then lay out each group as a column cluster
  const groups = new Map<string, ArrangeNode[]>()
  for (const item of items) {
    const list = groups.get(item.groupKey) ?? []
    list.push(item)
    groups.set(item.groupKey, list)
  }

  const result = new Map<string, { x: number; y: number }>()
  let groupX = 0

  for (const [, groupItems] of groups) {
    let y = 0
    let maxW = 0
    for (const item of groupItems) {
      result.set(item.id, { x: groupX, y })
      y += item.height + GRID_GAP
      maxW = Math.max(maxW, item.width)
    }
    groupX += maxW + GRID_GAP * 2
  }
  return result
}

function arrangeRadial(items: ArrangeNode[]): Map<string, { x: number; y: number }> {
  // Sort by sortKey descending — highest value in center
  const sorted = [...items].sort((a, b) => b.sortKey - a.sortKey)
  const result = new Map<string, { x: number; y: number }>()

  if (sorted.length === 0) return result

  // Center node
  result.set(sorted[0].id, { x: 0, y: 0 })

  // Remaining nodes in rings
  let ring = 1
  let idx = 1
  while (idx < sorted.length) {
    const radius = ring * 500
    const nodesInRing = Math.min(ring * 6, sorted.length - idx)
    for (let i = 0; i < nodesInRing && idx < sorted.length; i++, idx++) {
      const angle = (2 * Math.PI * i) / nodesInRing
      const x = Math.round(radius * Math.cos(angle) - sorted[idx].width / 2)
      const y = Math.round(radius * Math.sin(angle) - sorted[idx].height / 2)
      result.set(sorted[idx].id, { x, y })
    }
    ring++
  }
  return result
}

// ---------------------------------------------------------------------------
// Hook — listens for MCP actions from the main process
// ---------------------------------------------------------------------------

export function useMcpActions(): void {
  useEffect(() => {
    const listener = (_event: unknown, msg: { id: number; action: string; params: Record<string, unknown> }) => {
      const { id, action, params } = msg
      const respond = (result: unknown) => {
        window.mcp?.respond(id, result)
      }

      try {
        const result = handleAction(action, params)
        if (result instanceof Promise) {
          result.then(respond).catch((err) => respond({ error: err.message }))
        } else {
          respond(result)
        }
      } catch (err: any) {
        respond({ error: err.message })
      }
    }

    // @ts-ignore — window.mcp.onAction set up via preload
    const unsub = window.mcp?.onAction(listener)
    return unsub
  }, [])
}

function handleAction(action: string, params: Record<string, unknown>): unknown {
  const store = useNodeStore.getState()
  const cameraStore = useCameraStore.getState()

  switch (action) {
    case 'focusNode': {
      const id = params.id as string
      const node = store.nodes.get(id)
      if (!node) return { error: 'Node not found' }
      store.bringToFront(id)
      store.setFocusedNodeId(id)
      store.trackFocus(id)
      // Pan camera to center on the node
      const { width: vw, height: vh } = getCanvasRect()
      const targetX = vw / 2 - (node.x + node.width / 2) * cameraStore.camera.zoom
      const targetY = vh / 2 - (node.y + node.height / 2) * cameraStore.camera.zoom
      animateCameraTo({ x: targetX, y: targetY, zoom: cameraStore.camera.zoom }, 320)
      return { ok: true }
    }

    case 'openNode': {
      const type = params.type as NodeType
      const props = (params.props as Record<string, unknown>) ?? {}
      // Spawn at viewport center
      const camera = cameraStore.camera
      const vw = document.documentElement.clientWidth / 2
      const vh = document.documentElement.clientHeight / 2
      const wx = (vw - camera.x) / camera.zoom
      const wy = (vh - camera.y) / camera.zoom
      // Add workspace path for types that need it
      if ((type === 'terminal' || type === 'claude') && !props.cwd) {
        props.cwd = getActiveWorkspace()?.path || ''
      }
      if (type === 'monaco' && !props.rootPath) {
        props.rootPath = getActiveWorkspace()?.path || ''
      }
      const node = store.add(type, wx - 300, wy - 200, props)
      return { ok: true, nodeId: node.id }
    }

    case 'removeNode': {
      const id = params.id as string
      store.remove(id)
      return { ok: true }
    }

    case 'setCamera': {
      const x = params.x as number
      const y = params.y as number
      const zoom = params.zoom as number
      animateCameraTo({ x, y, zoom }, 320)
      return { ok: true }
    }

    case 'switchWorkspace': {
      const id = params.id as string
      const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
      if (!ws) return { error: 'Workspace not found' }
      useWorkspaceStore.getState().setActive(id)
      useWorkspaceStore.getState().touchWorkspace(id)
      return loadWorkspaceCanvas(id).then(() => ({ ok: true }))
    }

    case 'arrangeNodes': {
      const strategy = params.strategy as string
      const nodes = store.nodes
      if (nodes.size === 0) return { ok: true }

      const items: ArrangeNode[] = Array.from(nodes.values()).map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
        sortKey:
          strategy === 'by-recency' ? (n.lastFocusedAt ?? 0) :
          strategy === 'by-usage' ? (n.focusCount ?? 0) :
          0,
        groupKey: strategy === 'by-type' ? n.type : 'all',
      }))

      let positions: Map<string, { x: number; y: number }>
      switch (strategy) {
        case 'grid':
          positions = arrangeGrid(items)
          break
        case 'by-type':
          positions = arrangeByGroup(items)
          break
        case 'by-recency':
        case 'by-usage':
          positions = arrangeRadial(items)
          break
        default:
          positions = arrangeGrid(items)
      }

      // Apply positions
      for (const [id, pos] of positions) {
        store.update(id, { x: pos.x, y: pos.y })
      }

      // Fit camera to show all nodes
      fitAllNodes(store.nodes)
      return { ok: true }
    }

    case 'fitAll': {
      fitAllNodes(store.nodes)
      return { ok: true }
    }

    default:
      return { error: `Unknown action: ${action}` }
  }
}
