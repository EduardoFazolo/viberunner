import { ipcMain, IpcMainEvent, dialog, BrowserWindow } from 'electron'
import { homedir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import {
  getWorkspaces, saveWorkspace, deleteWorkspace,
  getNodes, saveNodes, deleteNode,
  getCamera, saveCamera,
  getAppState, setAppState,
  mergeNodeProps,
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

  // Synchronous variant used in beforeunload to guarantee the write completes before window closes
  ipcMain.on('canvas:saveNodesSync', (event: IpcMainEvent, workspaceId: string, nodes: NodeRow[]) => {
    try { saveNodes(workspaceId, nodes) } catch {}
    event.returnValue = null
  })

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

  // -------------------------------------------------------------------------
  // Terminal state serialization (xterm scrollback → SQLite)
  // -------------------------------------------------------------------------

  ipcMain.handle('terminal:saveState', (_e, nodeId: string, serializedState: string) =>
    mergeNodeProps(nodeId, { serializedState })
  )

  // -------------------------------------------------------------------------
  // File system
  // -------------------------------------------------------------------------

  ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name)
        let size = 0
        let modified = 0
        try {
          const stat = await fs.promises.stat(fullPath)
          size = stat.size
          modified = stat.mtimeMs
        } catch {}
        return {
          name: entry.name,
          isDir: entry.isDirectory(),
          size,
          modified,
        }
      })
    )
    // Dirs first, then files, both alphabetical
    return results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  })

  ipcMain.handle('fs:openFile', async (_e, filePath: string) => {
    const { shell } = await import('electron')
    await shell.openPath(filePath)
  })
}
