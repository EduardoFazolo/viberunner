import { ipcMain, WebContents } from 'electron'
import * as os from 'os'
import { tmuxManager } from './tmux'

interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  pid: number
}

const ptys = new Map<string, IPty>()
let isQuitting = false

export function setQuitting(): void {
  isQuitting = true
}

export function setupPtyHandlers(getWebContents: () => WebContents | null): void {
  // terminal:create(id, workspaceId, cwd, shell)
  ipcMain.handle('terminal:create', async (_event, id: string, workspaceId: string, cwd: string, shell: string) => {
    if (ptys.has(id)) return

    const pty = await import('node-pty')
    const defaultShell = shell || process.env.SHELL || '/bin/zsh'
    const defaultCwd = cwd || os.homedir()

    let ptyProcess: IPty

    if (tmuxManager.isAvailable() && workspaceId) {
      const session = tmuxManager.sessionName(workspaceId, id)
      const exists = await tmuxManager.sessionExists(session)

      if (!exists) {
        await tmuxManager.createSession(session, defaultCwd, defaultShell)
      }

      // Attach node-pty to the tmux session
      ptyProcess = pty.spawn(tmuxManager.getBin(), ['attach-session', '-t', session], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: defaultCwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      })
    } else {
      // No tmux — direct shell (no persistence)
      ptyProcess = pty.spawn(defaultShell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: defaultCwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      })
    }

    ptyProcess.onData((data: string) => {
      try {
        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('terminal:data', id, data)
        }
      } catch {
        // webContents destroyed mid-flight — ignore
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

  // terminal:kill(id, workspaceId, deleteSession)
  // deleteSession=true → also kill the tmux session (node was explicitly closed)
  // deleteSession=false → leave tmux alive (app quit / workspace switch)
  ipcMain.handle('terminal:kill', async (_event, id: string, workspaceId: string, deleteSession: boolean) => {
    const proc = ptys.get(id)
    if (proc) {
      try { proc.kill() } catch {}
      ptys.delete(id)
    }

    if (deleteSession && tmuxManager.isAvailable() && workspaceId) {
      const session = tmuxManager.sessionName(workspaceId, id)
      await tmuxManager.killSession(session)
    }
  })
}

export function killAllPtys(): void {
  setQuitting()
  for (const proc of ptys.values()) {
    try { proc.kill() } catch {}
  }
  ptys.clear()
  // tmux sessions stay alive intentionally — they'll be reattached on next launch
}

/** Remove tmux sessions that have no matching node in the database */
export async function cleanupOrphanSessions(validNodeIds: string[]): Promise<void> {
  if (!tmuxManager.isAvailable()) return

  const sessions = await tmuxManager.listManagedSessions()
  for (const session of sessions) {
    const hasNode = validNodeIds.some((id) => session.includes(id))
    if (!hasNode) {
      console.log('[tmux] Killing orphan session:', session)
      await tmuxManager.killSession(session)
    }
  }
}
