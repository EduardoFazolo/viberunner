import { ipcMain, WebContents } from 'electron'
import * as os from 'os'
import { join } from 'path'
import { tmuxManager } from './tmux'
import { AGENT_SIGNAL_PORT } from './agentSignalServer'

interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  pid: number
}

const ptys = new Map<string, IPty>()

export function setupPtyHandlers(getWebContents: () => WebContents | null): void {
  ipcMain.handle('terminal:create', async (_event, id: string, workspaceId: string, cwd: string, shell: string) => {
    if (ptys.has(id)) return

    const pty = await import('node-pty')
    const defaultShell = shell || process.env.SHELL || '/bin/zsh'
    // Expand ~ since node's spawn doesn't handle shell path expansion
    const rawCwd = cwd?.startsWith('~/') ? os.homedir() + cwd.slice(1)
                 : cwd === '~'           ? os.homedir()
                 : cwd || ''
    const defaultCwd = rawCwd || os.homedir()

    // Always run the shell directly — xterm.js owns scrollback natively.
    // tmux is used only to keep the background session alive for cwd/process persistence.
    // Starting/restoring is handled at the tmux session level, not by attaching here.
    // Strip TERM_SESSION_ID so zsh doesn't share/corrupt macOS shell session files
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { TERM_SESSION_ID: _sid, ...baseEnv } = process.env
    const canvaBin = join(os.homedir(), '.canvaflow', 'bin')
    const existingPath = baseEnv.PATH ?? ''
    const spawnOpts = {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env: {
        ...baseEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CANVAFLOW_NODE_ID: id,
        CANVAFLOW_PORT: String(AGENT_SIGNAL_PORT),
        PATH: existingPath.includes(canvaBin) ? existingPath : `${canvaBin}:${existingPath}`,
      },
    }
    let ptyProcess: Awaited<ReturnType<typeof pty.spawn>>
    try {
      ptyProcess = pty.spawn(defaultShell, [], { ...spawnOpts, cwd: defaultCwd })
    } catch {
      // cwd no longer exists — fall back to home directory
      ptyProcess = pty.spawn(defaultShell, [], { ...spawnOpts, cwd: os.homedir() })
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

    // Ensure a background tmux session exists for this terminal (for future process persistence).
    // We don't attach to it — it just keeps running in the background.
    if (tmuxManager.isAvailable() && workspaceId) {
      const session = tmuxManager.sessionName(workspaceId, id)
      const exists = await tmuxManager.sessionExists(session)
      if (!exists) {
        await tmuxManager.createSession(session, defaultCwd, defaultShell).catch(() => {})
      }
    }
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    ptys.get(id)?.write(data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    try { ptys.get(id)?.resize(cols, rows) } catch { /* PTY already closed */ }
  })

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
  for (const proc of ptys.values()) {
    try { proc.kill() } catch {}
  }
  ptys.clear()
}

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
