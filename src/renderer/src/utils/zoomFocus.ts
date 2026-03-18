/**
 * Shared zoom-to-fit state used by both the canvas double-tap listener
 * and the webview IPC handlers (NotionNode, BrowserNode).
 * Singleton so all sources share the same prevCamera.
 */
import type { Camera } from '../stores/cameraStore'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import { computeFitCamera, getCanvasRect } from './canvasUtils'

const state: { nodeId: string | null; prevCamera: Camera | null } = {
  nodeId: null,
  prevCamera: null,
}

/** Exit zoom mode unconditionally — restores the saved camera. */
export function zoomExit(): void {
  if (state.prevCamera) {
    animateCameraTo(state.prevCamera)
    state.prevCamera = null
    state.nodeId = null
  }
}

export function zoomFitNode(nodeId: string): void {
  const node = useNodeStore.getState().nodes.get(nodeId)
  if (!node) return

  // Second tap on the same node → zoom back out
  if (state.nodeId === nodeId && state.prevCamera) {
    animateCameraTo(state.prevCamera)
    state.prevCamera = null
    state.nodeId = null
    return
  }

  const { width: vw, height: vh } = getCanvasRect()
  const target = computeFitCamera(new Map([[nodeId, node]]), vw, vh)
  if (!target) return

  state.prevCamera = useCameraStore.getState().camera
  state.nodeId = nodeId
  animateCameraTo(target)
}
