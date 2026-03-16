import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const CANDIDATES = [
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux',
  'tmux',
]

async function resolveTmux(): Promise<string | null> {
  for (const bin of CANDIDATES) {
    try {
      await execFileAsync(bin, ['-V'])
      return bin
    } catch {}
  }
  return null
}

export class TmuxManager {
  private bin: string | null = null

  async init(): Promise<void> {
    this.bin = await resolveTmux()
    if (this.bin) {
      console.log('[tmux] Found at', this.bin)
    } else {
      console.warn('[tmux] Not found — terminal persistence disabled')
    }
  }

  isAvailable(): boolean {
    return this.bin !== null
  }

  getBin(): string {
    if (!this.bin) throw new Error('tmux not available')
    return this.bin
  }

  /** Deterministic session name from workspaceId + nodeId */
  sessionName(workspaceId: string, nodeId: string): string {
    return `cf-${workspaceId}-${nodeId}`
  }

  private async run(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(this.getBin(), args)
    return stdout.trim()
  }

  async sessionExists(name: string): Promise<boolean> {
    try {
      await this.run('has-session', '-t', name)
      return true
    } catch {
      return false
    }
  }

  async createSession(name: string, cwd: string, shell: string): Promise<void> {
    const sh = shell || process.env.SHELL || '/bin/zsh'
    await this.run('new-session', '-d', '-s', name, '-c', cwd, sh)
    await this.configureSession(name)
  }

  async configureSession(name: string): Promise<void> {
    try {
      await this.run('set-option', '-t', name, 'status', 'off')
      // mouse on: tmux intercepts scroll events and enters copy-mode for scrollback.
      // Without this, tmux runs in the alternate screen (no xterm.js scrollback buffer)
      // and scroll events get translated to cursor-up/down arrow keypresses.
      await this.run('set-option', '-t', name, 'mouse', 'on')
    } catch {}
  }

  /** @deprecated use configureSession */
  async hideStatusBar(name: string): Promise<void> {
    return this.configureSession(name)
  }

  async killSession(name: string): Promise<void> {
    try {
      await this.run('kill-session', '-t', name)
    } catch {}
  }

  /** List all canvaflow-managed sessions */
  async listManagedSessions(): Promise<string[]> {
    try {
      const out = await this.run('list-sessions', '-F', '#{session_name}')
      return out.split('\n').filter((s) => s.startsWith('cf-') && s.length > 3)
    } catch {
      return []
    }
  }
}

export const tmuxManager = new TmuxManager()
