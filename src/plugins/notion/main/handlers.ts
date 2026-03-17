import { ipcMain, session, BrowserWindow, screen } from 'electron'
import { tmpdir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { buildNotionExport } from './notionExport'
import type { IpcMainLike } from '../../types'

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

export const fetchNotionPageChunk = async (partition: string, pageId: string): Promise<any> => {
  const ses = session.fromPartition(partition)
  const cookies = await ses.cookies.get({ url: NOTION_ORIGIN })
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

export const fetchNotionImageDataUrl = async (
  partition: string,
  imageUrl: string,
  blockId?: string,
): Promise<string> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

export function registerNotionHandlers(ipc: IpcMainLike): void {
  ipc.handle('app:notionPreloadPath', () => {
    // __dirname resolves to out/main/ at runtime — same as workspace.ts
    const filePath = path.join(__dirname, '../preload/notionWebview.js')
    return `file://${filePath}`
  })

  ipc.handle('app:getCursorPos', () => {
    const cursor = screen.getCursorScreenPoint()
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { x: 0, y: 0 }
    const b = win.getContentBounds()
    return { x: cursor.x - b.x, y: cursor.y - b.y }
  })

  ipc.handle('notion:fetchImage', async (_e, partition: string, imageUrl: string, blockId?: string) =>
    fetchNotionImageDataUrl(partition, imageUrl, blockId)
  )

  ipc.handle(
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

  ipc.handle('notion:fetchPage', async (_e, partition: string, pageId: string) =>
    fetchNotionPageChunk(partition, pageId)
  )
}
