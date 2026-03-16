import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
})

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
