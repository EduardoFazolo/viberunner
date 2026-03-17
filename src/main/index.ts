import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { setupPtyHandlers, killAllPtys, cleanupOrphanSessions } from './pty'
import { initDatabase, getAllNodeIds } from './database'
import { setupWorkspaceHandlers } from './workspace'
import { tmuxManager } from './tmux'

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
    const mod = input.meta || input.control
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
}

app.whenReady().then(async () => {
  try {
    initDatabase()
  } catch (err) {
    console.error('[main] Database init failed, running without persistence:', err)
  }
  setupWorkspaceHandlers()

  // Init tmux and clean up orphan sessions from deleted nodes
  await tmuxManager.init()
  await cleanupOrphanSessions(getAllNodeIds())

  // Set a real Chrome UA on the browser-node partition so sites like YouTube don't block us
  const browserSession = session.fromPartition('persist:canvaflow-ws-default')
  browserSession.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  )

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
