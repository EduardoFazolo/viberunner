import { ipcMain, dialog, BrowserWindow } from 'electron'
import { homedir } from 'os'
import {
  getWorkspaces, saveWorkspace, deleteWorkspace,
  getNodes, saveNodes, deleteNode,
  getCamera, saveCamera,
  getAppState, setAppState,
  WorkspaceRow, NodeRow, CameraRow,
} from './database'

export function setupWorkspaceHandlers(): void {
  // -------------------------------------------------------------------------
  // Workspace CRUD
  // -------------------------------------------------------------------------

  ipcMain.handle('workspace:getAll', () => getWorkspaces())

  ipcMain.handle('workspace:save', (_e, w: WorkspaceRow) => saveWorkspace(w))

  ipcMain.handle('workspace:delete', (_e, id: string) => deleteWorkspace(id))

  ipcMain.handle('workspace:homedir', () => homedir())

  ipcMain.handle('workspace:openDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose a workspace directory',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // -------------------------------------------------------------------------
  // Canvas nodes
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getNodes', (_e, workspaceId: string) => getNodes(workspaceId))

  ipcMain.handle('canvas:saveNodes', (_e, workspaceId: string, nodes: NodeRow[]) =>
    saveNodes(workspaceId, nodes)
  )

  ipcMain.handle('canvas:deleteNode', (_e, id: string) => deleteNode(id))

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getCamera', (_e, workspaceId: string) => getCamera(workspaceId))

  ipcMain.handle('canvas:saveCamera', (_e, cam: CameraRow) => saveCamera(cam))

  // -------------------------------------------------------------------------
  // App state
  // -------------------------------------------------------------------------

  ipcMain.handle('app:getState', (_e, key: string) => getAppState(key))

  ipcMain.handle('app:setState', (_e, key: string, value: string) => setAppState(key, value))
}
