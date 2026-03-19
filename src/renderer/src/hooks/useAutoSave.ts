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
    contentScale: node.contentScale ?? 1,
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
      // Serialize all live terminals and inject into their nodes (across all workspaces)
      const terminalStates = serializeAllTerminals()
      for (const [nodeId, serializedState] of terminalStates) {
        // Terminal might be in any workspace — check all of them
        const { workspaceNodes } = useNodeStore.getState()
        for (const nodes of workspaceNodes.values()) {
          const current = nodes.get(nodeId)
          if (current) {
            nodes.set(nodeId, { ...current, props: { ...current.props, serializedState } })
            break
          }
        }
      }

      // Synchronous save of ALL loaded workspaces
      const { workspaceNodes, activeWorkspaceId } = useNodeStore.getState()
      for (const [wsId, nodes] of workspaceNodes.entries()) {
        const rows = Array.from(nodes.values()).map((n) => nodeToRow(n, wsId))
        window.canvas.saveNodesSync(wsId, rows)
      }

      // Camera: save active workspace (others were saved on switch via cameraStore subscriber)
      if (activeWorkspaceId) {
        window.canvas.saveCamera({ workspaceId: activeWorkspaceId, ...useCameraStore.getState().camera })
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      unsubNodes()
      unsubCamera()
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])
}
