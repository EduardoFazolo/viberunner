import { app, BrowserWindow, ipcMain, session, WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { setupPtyHandlers, killAllPtys, cleanupOrphanSessions } from './pty'
import { initDatabase, getAllNodeIds } from './database'
import { setupWorkspaceHandlers } from './workspace'
import { tmuxManager } from './tmux'
import { setupBrowserSession } from './browserSession'
import { registerNotionHandlers } from '../plugins/notion/main/handlers'

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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    // Use only meta (Cmd on macOS) so Ctrl+T/B/F/K/etc. pass through to terminals (readline shortcuts)
    const mod = input.meta
    if (mod && input.key === 't') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newTerminal') }
    else if (mod && input.key === 'b') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newBrowser') }
    else if (mod && input.key === 'f') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newFiles') }
    else if (mod && input.key === '0') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'fitAll') }
    else if (mod && input.key === 'k') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'search') }
    else if (mod && (input.key === '=' || input.key === '+')) { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'zoomIn') }
    else if (mod && input.key === '-') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'zoomOut') }
    else if (mod && input.key === ',') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'settings') }

  })

  // Kill all PTYs before the webContents is destroyed so onData never fires into a dead window
  mainWindow.on('close', () => {
    killAllPtys()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  setupPtyHandlers(() => mainWindow?.webContents ?? null)

  // Apply session setup to every webview that attaches (covers named sessions too)
  mainWindow.webContents.on('did-attach-webview', (_event, webviewContents: WebContents) => {
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

app.whenReady().then(async () => {
  try {
    initDatabase()
  } catch (err) {
    console.error('[main] Database init failed, running without persistence:', err)
  }
  setupWorkspaceHandlers()
  registerNotionHandlers(ipcMain)

  // Init tmux and clean up orphan sessions from deleted nodes
  await tmuxManager.init()
  await cleanupOrphanSessions(getAllNodeIds())

  // Set up default browser session
  setupBrowserSession(session.fromPartition('persist:canvaflow-ws-default'))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killAllPtys)

export { mainWindow }
