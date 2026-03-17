// Global window API types exposed via contextBridge

interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
}

interface NodeRow {
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

interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}

declare global {
  interface Window {
    terminal: {
      create: (id: string, workspaceId: string, cwd: string, shell: string) => Promise<void>
      write: (id: string, data: string) => void
      resize: (id: string, cols: number, rows: number) => void
      kill: (id: string, workspaceId: string, deleteSession: boolean) => Promise<void>
      saveState: (nodeId: string, serializedState: string) => Promise<void>
      onData: (id: string, cb: (data: string) => void) => () => void
    }

    workspace: {
      homedir: () => Promise<string>
      openDialog: () => Promise<string | null>
      getAll: () => Promise<WorkspaceRow[]>
      save: (w: WorkspaceRow) => Promise<void>
      delete: (id: string) => Promise<void>
    }

    canvas: {
      getNodes: (workspaceId: string) => Promise<NodeRow[]>
      saveNodes: (workspaceId: string, nodes: NodeRow[]) => Promise<void>
      saveNodesSync: (workspaceId: string, nodes: NodeRow[]) => void
      deleteNode: (id: string) => Promise<void>
      getCamera: (workspaceId: string) => Promise<CameraRow | null>
      saveCamera: (cam: CameraRow) => Promise<void>
    }

    appState: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
    }

    app: {
      onShortcut: (cb: (name: string) => void) => () => void
    }

    git: {
      clone: (repoUrl: string, targetDir: string) => Promise<void>
    }

    fs: {
      readDir: (dirPath: string) => Promise<Array<{
        name: string
        isDir: boolean
        size: number
        modified: number
      }>>
      openFile: (filePath: string) => Promise<void>
    }
  }
}

export {}
