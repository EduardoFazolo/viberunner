import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('terminal', {
  create: (id: string, cwd: string, shell: string) =>
    ipcRenderer.invoke('terminal:create', id, cwd, shell),

  write: (id: string, data: string) =>
    ipcRenderer.send('terminal:write', id, data),

  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),

  kill: (id: string) =>
    ipcRenderer.invoke('terminal:kill', id),

  onData: (id: string, callback: (data: string) => void) => {
    const listener = (_event: unknown, termId: string, data: string) => {
      if (termId === id) callback(data)
    }
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
})

contextBridge.exposeInMainWorld('workspace', {
  homedir: (): Promise<string> =>
    ipcRenderer.invoke('workspace:homedir'),

  openDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('workspace:openDialog'),

  getAll: (): Promise<WorkspaceRow[]> =>
    ipcRenderer.invoke('workspace:getAll'),

  save: (w: WorkspaceRow): Promise<void> =>
    ipcRenderer.invoke('workspace:save', w),

  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('workspace:delete', id),
})

contextBridge.exposeInMainWorld('canvas', {
  getNodes: (workspaceId: string): Promise<NodeRow[]> =>
    ipcRenderer.invoke('canvas:getNodes', workspaceId),

  saveNodes: (workspaceId: string, nodes: NodeRow[]): Promise<void> =>
    ipcRenderer.invoke('canvas:saveNodes', workspaceId, nodes),

  deleteNode: (id: string): Promise<void> =>
    ipcRenderer.invoke('canvas:deleteNode', id),

  getCamera: (workspaceId: string): Promise<CameraRow | null> =>
    ipcRenderer.invoke('canvas:getCamera', workspaceId),

  saveCamera: (cam: CameraRow): Promise<void> =>
    ipcRenderer.invoke('canvas:saveCamera', cam),
})

contextBridge.exposeInMainWorld('appState', {
  get: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('app:getState', key),

  set: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('app:setState', key, value),
})

// ---------------------------------------------------------------------------
// Shared types (used in preload — renderer accesses via window.*)
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
}

export interface NodeRow {
  id: string
  workspaceId: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: number
  props: string
  createdAt: number
  updatedAt: number
}

export interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}
