import { app, BrowserWindow, ipcMain, session, Menu, WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { setupPtyHandlers, killAllPtys, cleanupOrphanSessions } from './pty'
import { initDatabase, getAllNodeIds } from './database'
import { setupWorkspaceHandlers } from './workspace'
import { startAgentSignalServer } from '../modules/servers/agentic_signals/main/server'
import { setupAgenticSignalTools } from '../modules/servers/agentic_signals/main/setup'
import { tmuxManager } from './tmux'
import { setupBrowserSession } from './browserSession'
import { setupBrowserViewHandlers, destroyAllBrowserViews } from './browserViewManager'
import { registerNotionHandlers } from '../plugins/notion/main/handlers'
import { registerTrelloHandlers } from '../plugins/trello/main/handlers'
import { registerGitHandlers } from '../plugins/monaco/main/gitHandlers'
import { registerLovableHandlers } from '../plugins/lovable/main/handlers'
import { registerOrchestratorHandlers } from '../plugins/orchestrator/main/handlers'
import { registerMaestroHandlers } from '../plugins/maestro/main/handlers'
import { registerVoiceHandlers } from './voice'

// Suppress noisy Chromium GPU/Skia internal errors that are benign in webview usage
app.commandLine.appendSwitch('log-level', '3')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false // needed for node-pty in preload
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Prevent macOS Smart Zoom (two-finger double-tap) and pinch gestures from
  // scaling the renderer window. The UI uses fixed-pixel native elements
  // (traffic lights, WebContentsViews) that don't follow CSS zoom, so any
  // renderer-level zoom breaks the layout.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('zoom-changed', (_event, direction) => {
    // Swallow zoom-changed so Chromium doesn't apply a semantic zoom either.
    // Canvas zoom is handled internally via the camera store, not page zoom.
    void direction
  })

  // Keyboard shortcuts are registered via Menu accelerators (see buildAppMenu below)
  // so they work regardless of which webContents has focus (main renderer, WebContentsView, etc.).

  // Kill all PTYs before the webContents is destroyed so onData never fires into a dead window
  mainWindow.on('close', () => {
    destroyAllBrowserViews()
    killAllPtys()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  setupPtyHandlers(() => mainWindow?.webContents ?? null)
  startAgentSignalServer(() => mainWindow?.webContents ?? null)

  // Apply session setup to every webview that attaches (covers named sessions too)
  mainWindow.webContents.on('did-attach-webview', (_event, webviewContents: WebContents) => {
    // ERR_ABORTED (-3) fires whenever a navigation is cancelled mid-flight (webview
    // destroyed, redirected, etc.). It is harmless — suppress to keep logs clean.
    webviewContents.on('did-fail-load', (_e, errorCode) => {
      if (errorCode === -3) return
    })

    setupBrowserSession(webviewContents.session)

    // Popup windows (OAuth etc.) inherit the webview's session so cookies are shared
    webviewContents.setWindowOpenHandler((_details) => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 640,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          session: webviewContents.session,
        },
      },
    }))
  })
}

// Application menu with accelerators for all app shortcuts.
// Menu accelerators are handled at the OS/window level — they work regardless of
// which webContents has focus (main renderer, WebContentsView, webview, etc.).
function buildAppMenu(): void {
  const send = (name: string) => () => mainWindow?.webContents.send('shortcut', name)

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    {
      label: 'Edit', submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Canvas', submenu: [
        { label: 'New Terminal', accelerator: 'CmdOrCtrl+T', click: send('newTerminal') },
        { label: 'New Browser', accelerator: 'CmdOrCtrl+B', click: send('newBrowser') },
        { label: 'New Files', accelerator: 'CmdOrCtrl+F', click: send('newFiles') },
        { label: 'New Claude', accelerator: 'CmdOrCtrl+Shift+C', click: send('newClaude') },
        { label: 'New Editor', accelerator: 'CmdOrCtrl+Shift+E', click: send('newEditor') },
        { label: 'New Lovable', accelerator: 'CmdOrCtrl+Shift+L', click: send('newLovable') },
        { type: 'separator' },
        { label: 'Fit All', accelerator: 'CmdOrCtrl+0', click: send('fitAll') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: send('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: send('zoomOut') },
        { type: 'separator' },
        { label: 'Search', accelerator: 'CmdOrCtrl+K', click: send('search') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: send('settings') },
        { label: 'Voice Toggle', accelerator: 'CmdOrCtrl+Shift+V', click: send('voiceToggle') },
      ],
    },
    {
      label: 'View', submenu: [
        { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Toggle DevTools (Alt)', accelerator: 'CmdOrCtrl+Alt+I', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
  ]))
}

app.whenReady().then(async () => {
  try {
    initDatabase()
  } catch (err) {
    console.error('[main] Database init failed, running without persistence:', err)
  }
  setupWorkspaceHandlers()
  setupBrowserViewHandlers()
  setupAgenticSignalTools()
  registerNotionHandlers(ipcMain)
  registerTrelloHandlers(ipcMain)
  registerGitHandlers(ipcMain)
  registerLovableHandlers(ipcMain)
  registerOrchestratorHandlers(ipcMain, () => mainWindow?.webContents ?? null)
  registerMaestroHandlers(ipcMain)
  registerVoiceHandlers(() => mainWindow?.webContents ?? null)

  // Init tmux and clean up orphan sessions from deleted nodes
  await tmuxManager.init()
  await cleanupOrphanSessions(getAllNodeIds())

  // Set up default browser session
  setupBrowserSession(session.fromPartition('persist:canvaflow-ws-default'))

  createWindow()
  buildAppMenu()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      buildAppMenu()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killAllPtys)

export { mainWindow }
