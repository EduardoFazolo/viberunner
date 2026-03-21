import { BrowserWindow, WebContentsView, session, ipcMain } from 'electron'
import { join } from 'path'
import { setupBrowserSession } from './browserSession'

interface ViewEntry {
  view: WebContentsView
  partition: string
}

const views = new Map<string, ViewEntry>()
const boundsCache = new Map<string, { x: number; y: number; width: number; height: number }>()
const visibilityState = new Map<string, boolean>()

// The left boundary of the canvas content area (right edge of the sidebar).
// Enforced here so stale IPC bounds from the renderer can never cover the sidebar.
let canvasLeft = 240

// A position far off-screen used in place of setVisible(false).
// Keeping the view "visible" but off-screen preserves the Chromium compositor
// layer so the content doesn't need to repaint when moved back — no white flash.
// Must use large POSITIVE coordinates — negative coords can cause Electron's
// contentView to expand its layout bounds and shift the DOM sidebar/UI.
const OFF_SCREEN = { x: 99999, y: 99999, width: 1, height: 1 }

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/canvasWebview.js')
}

function makeSession(partition: string) {
  const ses = session.fromPartition(partition)
  setupBrowserSession(ses)
  return ses
}

function attachListeners(nodeId: string, view: WebContentsView): void {
  const wc = view.webContents

  wc.on('did-start-loading', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-start-loading', {})
  })

  wc.on('did-stop-loading', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-stop-loading', { url: wc.getURL() })
  })

  wc.on('did-navigate', (_e, url) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-navigate', { url })
  })

  wc.on('did-navigate-in-page', (_e, url) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-navigate-in-page', { url })
  })

  wc.on('page-title-updated', (_e, title) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'page-title-updated', { title })
  })

  wc.on('did-fail-load', (_e, errorCode) => {
    if (errorCode !== -3) {
      getMainWindow()?.webContents.send('browser:event', nodeId, 'did-fail-load', {})
    }
  })

  wc.on('focus', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'focus', {})
  })

  wc.setWindowOpenHandler((details) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'new-window', { url: details.url })
    return { action: 'deny' }
  })
}

export function createBrowserView(
  nodeId: string,
  partition: string,
  url: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  destroyBrowserView(nodeId)

  const win = getMainWindow()
  if (!win) return

  const ses = makeSession(partition)
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--canvaflow-node-id=${nodeId}`],
    },
  })

  views.set(nodeId, { view, partition })
  boundsCache.set(nodeId, bounds)
  visibilityState.set(nodeId, false)
  win.contentView.addChildView(view)
  view.setBounds(OFF_SCREEN)
  view.setVisible(true) // always visible; bounds control show/hide to avoid white flash on re-show

  attachListeners(nodeId, view)

  if (url) {
    view.webContents.loadURL(url).catch(() => {})
  }
}

export function destroyBrowserView(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  const win = getMainWindow()
  if (win) {
    try { win.contentView.removeChildView(entry.view) } catch {}
  }
  try { entry.view.webContents.close() } catch {}
  views.delete(nodeId)
  boundsCache.delete(nodeId)
  visibilityState.delete(nodeId)
}

export function changeBrowserViewSession(
  nodeId: string,
  partition: string,
  url: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  createBrowserView(nodeId, partition, url, bounds)
}

export function setCanvasLeft(left: number): void {
  canvasLeft = Math.round(left)
}

function applyBounds(entry: ViewEntry, bounds: { x: number; y: number; width: number; height: number }): void {
  const win = getMainWindow()
  const winBounds = win ? win.getContentBounds() : null
  // Enforce the sidebar clip in the main process — even if the renderer sends
  // stale/un-clipped bounds, the view can never appear to the left of canvasLeft.
  const x = Math.round(Math.max(bounds.x, canvasLeft, 0))
  const y = Math.round(Math.max(bounds.y, 0))
  const right = Math.round(bounds.x + bounds.width)
  const bottom = Math.round(bounds.y + bounds.height)
  const width = Math.max(right - x, 1)
  const height = Math.max(bottom - y, 1)
  const maxW = winBounds ? winBounds.width - x : width
  const maxH = winBounds ? winBounds.height - y : height
  entry.view.setBounds({
    x,
    y,
    width: Math.min(width, Math.max(maxW, 1)),
    height: Math.min(height, Math.max(maxH, 1)),
  })
}

export function updateBrowserViewBounds(
  nodeId: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  const entry = views.get(nodeId)
  if (!entry) return
  boundsCache.set(nodeId, bounds)
  // Only move the view if it's currently shown — if hidden (off-screen), the
  // cached bounds will be applied when setBrowserViewVisible(true) is called.
  if (visibilityState.get(nodeId)) {
    applyBounds(entry, bounds)
  }
}

export function setBrowserViewVisible(nodeId: string, visible: boolean): void {
  const entry = views.get(nodeId)
  if (!entry) return
  visibilityState.set(nodeId, visible)
  if (visible) {
    // Move to last known bounds, enforcing the canvas left boundary.
    const cached = boundsCache.get(nodeId)
    if (cached) applyBounds(entry, cached)
  } else {
    // Move off-screen instead of hiding — preserves compositor layer so the
    // content doesn't need to repaint when shown again (avoids white flash).
    entry.view.setBounds(OFF_SCREEN)
  }
}

export function setBrowserViewZoomFactor(nodeId: string, factor: number): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.webContents.setZoomFactor(Math.max(0.1, factor))
}

export function navigateBrowserView(nodeId: string, url: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.webContents.loadURL(url).catch(() => {})
}

export function browserViewBack(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  if (entry.view.webContents.navigationHistory.canGoBack()) entry.view.webContents.goBack()
}

export function browserViewForward(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  if (entry.view.webContents.navigationHistory.canGoForward()) entry.view.webContents.goForward()
}

export function browserViewReload(nodeId: string): void {
  views.get(nodeId)?.view.webContents.reload()
}

export function browserViewStop(nodeId: string): void {
  views.get(nodeId)?.view.webContents.stop()
}

export function focusBrowserView(nodeId: string): void {
  views.get(nodeId)?.view.webContents.focus()
}

export async function captureBrowserView(nodeId: string): Promise<string | null> {
  const entry = views.get(nodeId)
  if (!entry) return null
  try {
    const img = await entry.view.webContents.capturePage()
    return img.toDataURL()
  } catch {
    return null
  }
}

export async function executeBrowserViewJS(nodeId: string, js: string): Promise<unknown> {
  const entry = views.get(nodeId)
  if (!entry) return null
  return entry.view.webContents.executeJavaScript(js)
}

export function destroyAllBrowserViews(): void {
  for (const nodeId of [...views.keys()]) {
    destroyBrowserView(nodeId)
  }
}

export function setupBrowserViewHandlers(): void {
  ipcMain.handle('browser:create', (_e, nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => {
    createBrowserView(nodeId, partition, url, bounds)
  })

  ipcMain.handle('browser:destroy', (_e, nodeId: string) => {
    destroyBrowserView(nodeId)
  })

  ipcMain.handle('browser:change-session', (_e, nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => {
    changeBrowserViewSession(nodeId, partition, url, bounds)
  })

  ipcMain.on('browser:update-bounds', (_e, nodeId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    updateBrowserViewBounds(nodeId, bounds)
  })

  ipcMain.on('browser:set-canvas-left', (_e, left: number) => {
    setCanvasLeft(left)
  })

  ipcMain.on('browser:set-visible', (_e, nodeId: string, visible: boolean) => {
    setBrowserViewVisible(nodeId, visible)
  })

  ipcMain.on('browser:set-zoom-factor', (_e, nodeId: string, factor: number) => {
    setBrowserViewZoomFactor(nodeId, factor)
  })

  ipcMain.on('browser:navigate', (_e, nodeId: string, url: string) => {
    navigateBrowserView(nodeId, url)
  })

  ipcMain.on('browser:back', (_e, nodeId: string) => { browserViewBack(nodeId) })
  ipcMain.on('browser:forward', (_e, nodeId: string) => { browserViewForward(nodeId) })
  ipcMain.on('browser:reload', (_e, nodeId: string) => { browserViewReload(nodeId) })
  ipcMain.on('browser:stop', (_e, nodeId: string) => { browserViewStop(nodeId) })
  ipcMain.on('browser:focus', (_e, nodeId: string) => { focusBrowserView(nodeId) })

  ipcMain.handle('browser:capture', (_e, nodeId: string) => captureBrowserView(nodeId))

  ipcMain.handle('browser:execute-js', (_e, nodeId: string, js: string) => executeBrowserViewJS(nodeId, js))

  // Forward canvas events from the WebContentsView preload → main → renderer
  ipcMain.on('browser:canvas-event', (_e, nodeId: string, channel: string, data: unknown) => {
    getMainWindow()?.webContents.send('browser:canvas-event', nodeId, channel, data)
  })
}
