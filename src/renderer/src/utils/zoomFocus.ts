/**
 * Shared zoom-to-fit state used by both the canvas double-tap listener
 * and the webview IPC handlers (NotionNode, BrowserNode).
 * Singleton so all sources share the same prevCamera.
 */
import type { Camera } from '../stores/cameraStore'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import { computeFitCamera, getCanvasRect } from './canvasUtils'

const state: { nodeId: string | null } = {
  nodeId: null,
}

/** Exit zoom mode unconditionally — fits all nodes in view. */
export function zoomExit(): void {
  const { width: vw, height: vh } = getCanvasRect()
  const allNodes = useNodeStore.getState().nodes
  const target = computeFitCamera(allNodes, vw, vh)
  if (target) animateCameraTo(target)
  state.nodeId = null
}

export function zoomFitNode(nodeId: string): void {
  const { width: vw, height: vh } = getCanvasRect()
  const allNodes = useNodeStore.getState().nodes
  const node = allNodes.get(nodeId)
  if (!node) return

  // Second tap on the same node → always zoom out to fit all nodes
  if (state.nodeId === nodeId) {
    const target = computeFitCamera(allNodes, vw, vh)
    if (target) animateCameraTo(target)
    state.nodeId = null
    return
  }

  // First tap → zoom to fit this node
  const target = computeFitCamera(new Map([[nodeId, node]]), vw, vh)
  if (!target) return

  state.nodeId = nodeId
  animateCameraTo(target)
}
