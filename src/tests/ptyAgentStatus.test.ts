import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handleHandlers = new Map<string, (...args: any[]) => any>()
  const onHandlers = new Map<string, (...args: any[]) => any>()

  let dataListener: ((data: string) => void) | null = null

  const fakePty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => {
      dataListener = cb
    }),
    pid: 1234,
  }

  const spawn = vi.fn(() => fakePty)

  const webContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  }

  return {
    handleHandlers,
    onHandlers,
    fakePty,
    spawn,
    webContents,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        handleHandlers.set(channel, handler)
      }),
      on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        onHandlers.set(channel, handler)
      }),
    },
    tmuxManager: {
      isAvailable: vi.fn(() => false),
      sessionName: vi.fn(),
      sessionExists: vi.fn(),
      createSession: vi.fn(),
      killSession: vi.fn(),
      listManagedSessions: vi.fn(),
    },
    emitPtyData(data: string) {
      if (!dataListener) throw new Error('Expected PTY onData listener to be registered')
      dataListener(data)
    },
    reset() {
      handleHandlers.clear()
      onHandlers.clear()
      dataListener = null
      fakePty.write.mockReset()
      fakePty.resize.mockReset()
      fakePty.kill.mockReset()
      fakePty.onData.mockClear()
      spawn.mockClear()
      webContents.send.mockReset()
      webContents.isDestroyed.mockReset()
      webContents.isDestroyed.mockReturnValue(false)
      this.ipcMain.handle.mockClear()
      this.ipcMain.on.mockClear()
      this.tmuxManager.isAvailable.mockClear()
      this.tmuxManager.isAvailable.mockReturnValue(false)
      this.tmuxManager.sessionName.mockClear()
      this.tmuxManager.sessionExists.mockClear()
      this.tmuxManager.createSession.mockClear()
      this.tmuxManager.killSession.mockClear()
      this.tmuxManager.listManagedSessions.mockClear()
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
  WebContents: class {},
}))

vi.mock('node-pty', () => ({
  spawn: mocks.spawn,
}))

vi.mock('../main/tmux', () => ({
  tmuxManager: mocks.tmuxManager,
}))

import { killAllPtys, setupPtyHandlers } from '../main/pty'

function getHandle(channel: string) {
  const handler = mocks.handleHandlers.get(channel)
  if (!handler) throw new Error(`Missing ipcMain.handle registration for ${channel}`)
  return handler
}

describe('agent status PTY regressions', () => {
  beforeEach(async () => {
    mocks.reset()
    killAllPtys()
    setupPtyHandlers(() => mocks.webContents as any)
    await getHandle('terminal:create')(undefined, 'node-1', 'workspace-1', '/tmp', '/bin/zsh')
    mocks.webContents.send.mockClear()
  })

  afterEach(() => {
    killAllPtys()
  })

  it('emits a permission-needed status when Claude shows a permission prompt', () => {
    mocks.emitPtyData([
      'Permission',
      '',
      'Can I run shell commands to inspect the project?',
      '',
      '1. Yes, go ahead',
      '2. No, don\'t run commands',
      '3. Type something.',
      '',
      'Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\r\n'))

    expect(mocks.webContents.send).toHaveBeenCalledWith(
      'agent:status',
      expect.objectContaining({ nodeId: 'node-1', status: 'needs_permission' })
    )
  })

  it('emits a user-input-needed status when Claude shows a task selection prompt', () => {
    mocks.emitPtyData([
      'What would you like to work on?',
      '',
      '1. Fix a bug',
      '2. Add a feature',
      '',
      'Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\r\n'))

    expect(mocks.webContents.send).toHaveBeenCalledWith(
      'agent:status',
      expect.objectContaining({ nodeId: 'node-1', status: 'needs_input' })
    )
  })

  it('clears thinking when Ctrl+C stops the agent and the shell prompt returns', () => {
    mocks.emitPtyData('^C\r\neduardoverona@macbook canvaflow % ')

    expect(mocks.webContents.send).toHaveBeenCalledWith(
      'agent:status',
      expect.objectContaining({ nodeId: 'node-1', status: 'idle' })
    )
  })

  it('clears thinking when the terminal is torn down while the agent is active', async () => {
    await getHandle('terminal:kill')(undefined, 'node-1', 'workspace-1', false)

    expect(mocks.webContents.send).toHaveBeenCalledWith(
      'agent:status',
      expect.objectContaining({ nodeId: 'node-1', status: 'idle' })
    )
  })
})
