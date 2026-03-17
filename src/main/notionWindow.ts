import { BrowserWindow, WebContentsView, Rectangle, View, session } from 'electron'
import { CHROME_UA, setupBrowserSession } from './browserAuth'

interface NotionWindowState {
  open: boolean
  title: string
  url: string
}

interface NotionPlacement {
  x: number
  y: number
  width: number
  height: number
  clipX: number
  clipY: number
  clipWidth: number
  clipHeight: number
  visible: boolean
  zoom: number
}

interface NotionSurface {
  host: BrowserWindow
  container: View
  view: WebContentsView
}

const notionSurfaces = new Map<string, NotionSurface>()

function isViewAttached(parent: View, child: View): boolean {
  return parent.children.includes(child)
}

function detachSurface(nodeId: string): NotionSurface | null {
  const surface = notionSurfaces.get(nodeId) ?? null
  if (!surface) return null

  if (!surface.host.isDestroyed() && isViewAttached(surface.host.contentView, surface.container)) {
    surface.host.contentView.removeChildView(surface.container)
  }

  try {
    surface.view.webContents.close()
  } catch {
    // ignore
  }

  notionSurfaces.delete(nodeId)
  return surface
}

function getTrackedSurface(nodeId: string): NotionSurface | null {
  const surface = notionSurfaces.get(nodeId) ?? null
  if (!surface) return null

  if (surface.host.isDestroyed() || surface.view.webContents.isDestroyed()) {
    detachSurface(nodeId)
    return null
  }

  return surface
}

export async function openNotionWindow(
  host: BrowserWindow,
  nodeId: string,
  partition: string,
  startUrl = 'https://www.notion.so'
): Promise<NotionWindowState> {
  const existing = getTrackedSurface(nodeId)
  if (existing) {
    if (startUrl && existing.view.webContents.getURL() !== startUrl) {
      await existing.view.webContents.loadURL(startUrl, { userAgent: CHROME_UA })
    }
    if (!isViewAttached(host.contentView, existing.container)) {
      host.contentView.addChildView(existing.container)
    }
    if (!isViewAttached(existing.container, existing.view)) {
      existing.container.addChildView(existing.view)
    }
    existing.view.webContents.focus()
    return getNotionWindowState(nodeId)
  }

  const effectiveSession = session.fromPartition(partition)
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      session: effectiveSession,
    },
  })

  const targetSession = view.webContents.session
  setupBrowserSession(targetSession)
  view.webContents.setUserAgent(CHROME_UA)
  view.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 520,
      height: 680,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nativeWindowOpen: true,
        session: targetSession,
      },
    },
  }))

  const container = new View()
  container.setBackgroundColor('#00000000')
  host.contentView.addChildView(container)
  container.addChildView(view)
  container.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

  notionSurfaces.set(nodeId, { host, container, view })

  await view.webContents.loadURL(startUrl, { userAgent: CHROME_UA })
  return getNotionWindowState(nodeId)
}

export function focusNotionWindow(nodeId: string): NotionWindowState {
  const surface = getTrackedSurface(nodeId)
  if (!surface) return { open: false, title: '', url: '' }
  surface.view.webContents.focus()
  return getNotionWindowState(nodeId)
}

export function closeNotionWindow(nodeId: string): NotionWindowState {
  detachSurface(nodeId)
  return { open: false, title: '', url: '' }
}

export function getNotionWindowState(nodeId: string): NotionWindowState {
  const surface = getTrackedSurface(nodeId)
  if (!surface) return { open: false, title: '', url: '' }
  return {
    open: true,
    title: surface.view.webContents.getTitle(),
    url: surface.view.webContents.getURL(),
  }
}

export function updateNotionPlacement(nodeId: string, placement: NotionPlacement | null): NotionWindowState {
  const surface = getTrackedSurface(nodeId)
  if (!surface) return { open: false, title: '', url: '' }

  if (!placement || !placement.visible || placement.width <= 0 || placement.height <= 0) {
    surface.container.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    surface.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return getNotionWindowState(nodeId)
  }

  surface.view.webContents.setZoomFactor(Math.max(0.25, Math.min(3, placement.zoom)))

  const clipBounds: Rectangle = {
    x: Math.round(placement.clipX),
    y: Math.round(placement.clipY),
    width: Math.round(placement.clipWidth),
    height: Math.round(placement.clipHeight),
  }

  const viewBounds: Rectangle = {
    x: Math.round(placement.x - placement.clipX),
    y: Math.round(placement.y - placement.clipY),
    width: Math.round(placement.width),
    height: Math.round(placement.height),
  }

  surface.container.setBounds(clipBounds)
  surface.view.setBounds(viewBounds)
  return getNotionWindowState(nodeId)
}

export async function captureNotionWindow(nodeId: string): Promise<string | null> {
  const surface = getTrackedSurface(nodeId)
  if (!surface) return null

  try {
    const image = await surface.view.webContents.capturePage()
    return image.toDataURL()
  } catch {
    return null
  }
}
