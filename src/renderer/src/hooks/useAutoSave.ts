import { useEffect, useRef } from 'react'
import { useNodeStore, NodeData } from '../stores/nodeStore'
import { useCameraStore, Camera } from '../stores/cameraStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { serializeAllTerminals } from '../terminalRegistry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeToRow(node: NodeData, workspaceId: string) {
  return {
    id: node.id,
    workspaceId,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    zIndex: node.zIndex,
    title: node.title,
    minimized: node.minimized ? 1 : 0,
    props: JSON.stringify(node.props),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

async function persistCanvas(workspaceId: string, nodes: Map<string, NodeData>, camera: Camera) {
  const rows = Array.from(nodes.values()).map((n) => nodeToRow(n, workspaceId))
  await Promise.all([
    window.canvas.saveNodes(workspaceId, rows),
    window.canvas.saveCamera({ workspaceId, ...camera }),
    window.appState.set('lastWorkspaceId', workspaceId),
  ])
}

// ---------------------------------------------------------------------------
// Hook — sets up debounced auto-save and force-save on before-quit
// ---------------------------------------------------------------------------

const NODE_DEBOUNCE_MS = 500
const CAMERA_DEBOUNCE_MS = 1000

export function useAutoSave(): void {
  const nodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubNodes = useNodeStore.subscribe((state) => {
      const workspaceId = useWorkspaceStore.getState().activeId
      if (!workspaceId) return
      if (nodeTimerRef.current) clearTimeout(nodeTimerRef.current)
      nodeTimerRef.current = setTimeout(async () => {
        const rows = Array.from(state.nodes.values()).map((n) =>
          nodeToRow(n, workspaceId)
        )
        await window.canvas.saveNodes(workspaceId, rows)
      }, NODE_DEBOUNCE_MS)
    })

    const unsubCamera = useCameraStore.subscribe((state) => {
      const workspaceId = useWorkspaceStore.getState().activeId
      if (!workspaceId) return
      if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current)
      cameraTimerRef.current = setTimeout(async () => {
        await window.canvas.saveCamera({
          workspaceId,
          ...state.camera,
        })
      }, CAMERA_DEBOUNCE_MS)
    })

    // Force-save on page unload — synchronous so it completes before the window closes
    const onBeforeUnload = () => {
      const workspaceId = useWorkspaceStore.getState().activeId
      if (!workspaceId) return

      // Serialize all live terminals and inject into the store before saving
      const terminalStates = serializeAllTerminals()
      for (const [nodeId, serializedState] of terminalStates) {
        const current = useNodeStore.getState().nodes.get(nodeId)
        if (current) {
          useNodeStore.getState().update(nodeId, { props: { ...current.props, serializedState } })
        }
      }

      // Synchronous save — blocks until SQLite write completes (renderer stays alive)
      const nodes = useNodeStore.getState().nodes
      const rows = Array.from(nodes.values()).map((n) => nodeToRow(n, workspaceId))
      window.canvas.saveNodesSync(workspaceId, rows)

      // Camera can remain async (non-critical)
      window.canvas.saveCamera({ workspaceId, ...useCameraStore.getState().camera })
    }

    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      unsubNodes()
      unsubCamera()
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])
}
