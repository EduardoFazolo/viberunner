import { ipcMain, WebContents } from 'electron'
import * as os from 'os'

// node-pty types
interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  pid: number
}

const ptys = new Map<string, IPty>()

export function setupPtyHandlers(getWebContents: () => WebContents | null): void {
  ipcMain.handle('terminal:create', async (_event, id: string, cwd: string, shell: string) => {
    if (ptys.has(id)) return

    // Dynamic import of node-pty (native module)
    const pty = await import('node-pty')

    const defaultShell = shell || process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
    const defaultCwd = cwd || os.homedir()

    const ptyProcess = pty.spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: defaultCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    })

    ptyProcess.onData((data: string) => {
      const wc = getWebContents()
      if (wc && !wc.isDestroyed()) {
        wc.send('terminal:data', id, data)
      }
    })

    ptys.set(id, ptyProcess)
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    ptys.get(id)?.write(data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    ptys.get(id)?.resize(cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    ptys.get(id)?.kill()
    ptys.delete(id)
  })
}

export function killAllPtys(): void {
  for (const pty of ptys.values()) {
    try { pty.kill() } catch {}
  }
  ptys.clear()
}
