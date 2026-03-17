import { ipcMain, IpcMainEvent, dialog, BrowserWindow, session, screen } from 'electron'
import { homedir, tmpdir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { setupBrowserSession } from './browserSession'
import { buildNotionExport } from './notionExport'
import {
  getWorkspaces, saveWorkspace, deleteWorkspace,
  getNodes, saveNodes, deleteNode,
  getCamera, saveCamera,
  getAppState, setAppState,
  mergeNodeProps,
  getBrowserSessions, saveBrowserSession, deleteBrowserSession,
  WorkspaceRow, NodeRow, CameraRow, BrowserSessionRow,
} from './database'

export function setupWorkspaceHandlers(): void {
  // -------------------------------------------------------------------------
  // Workspace CRUD
  // -------------------------------------------------------------------------

  ipcMain.handle('workspace:getAll', () => getWorkspaces())

  ipcMain.handle('workspace:save', (_e, w: WorkspaceRow) => saveWorkspace(w))

  ipcMain.handle('workspace:delete', (_e, id: string) => deleteWorkspace(id))

  ipcMain.handle('workspace:homedir', () => homedir())

  ipcMain.handle('workspace:openDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose a workspace directory',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // -------------------------------------------------------------------------
  // Canvas nodes
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getNodes', (_e, workspaceId: string) => getNodes(workspaceId))

  ipcMain.handle('canvas:saveNodes', (_e, workspaceId: string, nodes: NodeRow[]) =>
    saveNodes(workspaceId, nodes)
  )

  // Synchronous variant used in beforeunload to guarantee the write completes before window closes
  ipcMain.on('canvas:saveNodesSync', (event: IpcMainEvent, workspaceId: string, nodes: NodeRow[]) => {
    try { saveNodes(workspaceId, nodes) } catch {}
    event.returnValue = null
  })

  ipcMain.handle('canvas:deleteNode', (_e, id: string) => deleteNode(id))

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getCamera', (_e, workspaceId: string) => getCamera(workspaceId))

  ipcMain.handle('canvas:saveCamera', (_e, cam: CameraRow) => saveCamera(cam))

  // -------------------------------------------------------------------------
  // App state
  // -------------------------------------------------------------------------

  ipcMain.handle('app:getState', (_e, key: string) => getAppState(key))

  ipcMain.handle('app:setState', (_e, key: string, value: string) => setAppState(key, value))

  // -------------------------------------------------------------------------
  // Terminal state serialization (xterm scrollback → SQLite)
  // -------------------------------------------------------------------------

  ipcMain.handle('terminal:saveState', (_e, nodeId: string, serializedState: string) =>
    mergeNodeProps(nodeId, { serializedState })
  )

  // -------------------------------------------------------------------------
  // Browser sessions
  // -------------------------------------------------------------------------

  ipcMain.handle('sessions:getAll', () => getBrowserSessions())

  ipcMain.handle('sessions:save', (_e, s: BrowserSessionRow) => saveBrowserSession(s))

  ipcMain.handle('sessions:delete', (_e, id: string) => deleteBrowserSession(id))

  // Opens a real BrowserWindow (no webview restrictions) for OAuth/login.
  // The window uses the given partition so cookies land in the right session.
  // Resolves when the user closes the window.
  ipcMain.handle('session:openLoginWindow', async (_e, partition: string, url: string) => {
    const ses = session.fromPartition(partition)
    setupBrowserSession(ses)

    const win = new BrowserWindow({
      width: 1000,
      height: 720,
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    win.loadURL(url)

    return new Promise<void>((resolve) => {
      win.on('closed', () => resolve())
    })
  })

  // -------------------------------------------------------------------------
  // File system
  // -------------------------------------------------------------------------

  ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name)
        let size = 0
        let modified = 0
        try {
          const stat = await fs.promises.stat(fullPath)
          size = stat.size
          modified = stat.mtimeMs
        } catch {}
        return {
          name: entry.name,
          isDir: entry.isDirectory(),
          size,
          modified,
        }
      })
    )
    // Dirs first, then files, both alphabetical
    return results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  })

  ipcMain.handle('fs:openFile', async (_e, filePath: string) => {
    const { shell } = await import('electron')
    await shell.openPath(filePath)
  })

  ipcMain.handle('fs:delete', async (_e, filePath: string) => {
    await fs.promises.rm(filePath, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------------
  // Git
  // -------------------------------------------------------------------------

  ipcMain.handle('git:clone', (_e, repoUrl: string, targetDir: string) => {
    return new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process')
      const proc = spawn('git', ['clone', repoUrl], { cwd: targetDir })
      let stderr = ''
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', (code: number) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `git clone exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  })

  // -------------------------------------------------------------------------
  // Notion
  // -------------------------------------------------------------------------

  // Returns cursor position in renderer client coordinates (logical px, no DPR confusion)
  ipcMain.handle('app:getCursorPos', () => {
    const cursor = screen.getCursorScreenPoint()
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { x: 0, y: 0 }
    const b = win.getContentBounds()
    return { x: cursor.x - b.x, y: cursor.y - b.y }
  })

  ipcMain.handle('app:notionPreloadPath', () => {
    // Electron webview preload attribute requires a file:// URL, not a raw path
    const filePath = path.join(__dirname, '../preload/notionWebview.js')
    return `file://${filePath}`
  })

  const NOTION_ORIGIN = 'https://www.notion.so'
  const NOTION_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  const formatUuid = (id: string): string =>
    id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')

  const sanitizeFileName = (value: string): string => {
    const trimmed = value.trim().replace(/\s+/g, ' ')
    const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim()
    return (safe || 'Untitled').slice(0, 80)
  }

  const buildCookieHeader = async (ses: Electron.Session, url: string): Promise<string> => {
    const cookies = await ses.cookies.get({ url })
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }

  const isNotionAssetUrl = (value: string): boolean => {
    if (value.startsWith('attachment:')) return true

    try {
      const url = new URL(value)
      const host = url.hostname.toLowerCase()
      const href = url.href.toLowerCase()
      return (
        host.endsWith('.notion.so') ||
        host === 'notion.so' ||
        host.endsWith('.notion-static.com') ||
        host === 'notion-static.com' ||
        href.includes('secure.notion-static.com')
      )
    } catch {
      return false
    }
  }

  const fetchNotionPageChunk = async (partition: string, pageId: string): Promise<any> => {
    const ses = session.fromPartition(partition)
    const cookies = await ses.cookies.get({ url: 'https://www.notion.so' })
    const tokenCookie = cookies.find((c) => c.name === 'token_v2')
    if (!tokenCookie) throw new Error('Not logged in to Notion (no token_v2 cookie)')

    const res = await fetch(`${NOTION_ORIGIN}/api/v3/loadPageChunk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': `token_v2=${tokenCookie.value}`,
        'user-agent': NOTION_UA,
      },
      body: JSON.stringify({
        pageId: formatUuid(pageId),
        limit: 100,
        cursor: { stack: [] },
        chunkNumber: 0,
        verticalColumns: false,
      }),
    })

    if (!res.ok) throw new Error(`Notion API returned ${res.status}`)
    return res.json()
  }

  const fetchNotionImageDataUrl = async (partition: string, imageUrl: string, blockId?: string): Promise<string> => {
    const sharp = require('sharp')
    const ses = session.fromPartition(partition)
    const notionCookieHeader = await buildCookieHeader(ses, NOTION_ORIGIN)
    const notionHeaders = {
      'content-type': 'application/json',
      'cookie': notionCookieHeader,
      'origin': NOTION_ORIGIN,
      'referer': `${NOTION_ORIGIN}/`,
      'user-agent': NOTION_UA,
    }

    const resolveSignedFileUrl = async (sourceUrl: string): Promise<string> => {
      if (!blockId) throw new Error('blockId required to resolve Notion file URLs')
      const res = await ses.fetch(`${NOTION_ORIGIN}/api/v3/getSignedFileUrls`, {
        method: 'POST',
        headers: notionHeaders,
        credentials: 'include',
        body: JSON.stringify({
          urls: [{ url: sourceUrl, permissionRecord: { table: 'block', id: formatUuid(blockId) } }],
        }),
      })
      if (!res.ok) throw new Error(`getSignedFileUrls failed: ${res.status}`)
      const data = await res.json()
      const signedUrl = data.signedUrls?.[0]
      if (!signedUrl) throw new Error('No signed URL returned')
      return signedUrl
    }

    const fetchImageResponse = async (targetUrl: string): Promise<Response> => {
      if (isNotionAssetUrl(targetUrl)) {
        return ses.fetch(targetUrl, {
          headers: {
            'cookie': notionCookieHeader,
            'referer': `${NOTION_ORIGIN}/`,
            'user-agent': NOTION_UA,
          },
          credentials: 'include',
        })
      }
      return fetch(targetUrl)
    }

    let resolvedUrl = imageUrl

    if (imageUrl.startsWith('attachment:')) {
      resolvedUrl = await resolveSignedFileUrl(imageUrl)
    } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      throw new Error(`Unsupported image scheme`)
    }

    let res = await fetchImageResponse(resolvedUrl)
    if (res.status === 403 && blockId && isNotionAssetUrl(imageUrl) && !imageUrl.startsWith('attachment:')) {
      resolvedUrl = await resolveSignedFileUrl(imageUrl)
      res = await fetchImageResponse(resolvedUrl)
    }
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)

    const buf = Buffer.from(await res.arrayBuffer())
    try {
      const out = await sharp(buf)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      return `data:image/webp;base64,${out.toString('base64')}`
    } catch {
      const ct = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
      return `data:${ct};base64,${buf.toString('base64')}`
    }
  }

  ipcMain.handle('notion:fetchImage', async (_e, partition: string, imageUrl: string, blockId?: string) =>
    fetchNotionImageDataUrl(partition, imageUrl, blockId)
  )

  ipcMain.handle(
    'notion:prepareExternalDrag',
    async (_e, partition: string, pageId: string, title: string, pageUrl?: string) => {
      const chunk = await fetchNotionPageChunk(partition, pageId)
      const imageBlocks = Object.values(chunk.recordMap.block)
        .filter((b: any) => b.value.type === 'image')
        .map((b: any) => ({
          blockId: b.value.id as string,
          src: (b.value.format?.display_source ?? b.value.properties?.source?.[0]?.[0]) as string,
        }))
        .filter((item): item is { blockId: string; src: string } => typeof item.src === 'string')

      const imageMap: Record<string, string> = {}
      await Promise.all(imageBlocks.map(async ({ blockId, src }) => {
        try {
          imageMap[src] = await fetchNotionImageDataUrl(partition, src, blockId)
        } catch (err) {
          console.error('[notion:prepareExternalDrag] fetchImage failed for', src, err)
        }
      }))

      const exported = buildNotionExport(pageId, chunk.recordMap.block, imageMap)
      const effectiveTitle = title.trim() || 'Untitled'
      const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'canvaflow-notion-drag-'))
      const filename = `${sanitizeFileName(effectiveTitle)}.md`
      const filePath = path.join(tempDir, filename)

      await fs.promises.writeFile(filePath, exported.markdown || `# ${effectiveTitle}\n`, 'utf8')

      return {
        title: effectiveTitle,
        text: exported.text || effectiveTitle,
        html: exported.html || `<h1>${effectiveTitle}</h1>`,
        markdown: exported.markdown || `# ${effectiveTitle}\n`,
        filename,
        filePath,
        fileUrl: pathToFileURL(filePath).toString(),
        pageUrl: pageUrl || `${NOTION_ORIGIN}/${pageId}`,
      }
    }
  )

  ipcMain.handle('notion:fetchPage', async (_e, partition: string, pageId: string) =>
    fetchNotionPageChunk(partition, pageId)
  )
}
