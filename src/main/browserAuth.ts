import { app, BrowserWindow, session, Session } from 'electron'

export const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const configuredSessions = new WeakSet<Session>()

export function configureBrowserRuntime(): void {
  app.userAgentFallback = CHROME_UA
}

/**
 * Apply UA override and strip framing-prevention headers for a session.
 * Must be called for every session used by a browser surface so sites like Notion
 * don't abort navigation due to X-Frame-Options / CSP frame-ancestors.
 */
export function setupBrowserSession(ses: Session): void {
  if (configuredSessions.has(ses)) return
  configuredSessions.add(ses)

  ses.setUserAgent(CHROME_UA)

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = {}

    for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
      headers[key.toLowerCase()] = value as string[]
    }

    delete headers['x-frame-options']

    if (headers['content-security-policy']) {
      headers['content-security-policy'] = headers['content-security-policy'].map((csp) =>
        csp.replace(/frame-ancestors[^;]*(;|$)\s*/gi, '').trim()
      )
    }

    delete headers['cross-origin-opener-policy']
    delete headers['cross-origin-embedder-policy']

    callback({ responseHeaders: headers })
  })
}

function isNotionHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    return /(^|\.)notion\.(so|com)$/i.test(parsed.hostname)
  } catch {
    return false
  }
}

function isLikelyLoggedInNotionUrl(url: string): boolean {
  if (!isNotionHost(url)) return false

  try {
    const parsed = new URL(url)
    const path = parsed.pathname.toLowerCase()
    if (path === '/' || path === '') return true
    if (path.startsWith('/login')) return false
    if (path.startsWith('/signup')) return false
    if (path.includes('auth')) return false
    return true
  } catch {
    return false
  }
}

export async function openNotionLoginWindow(
  partition: string,
  startUrl = 'https://www.notion.com/login'
): Promise<{ authenticated: boolean }> {
  const ses = session.fromPartition(partition)
  setupBrowserSession(ses)

  return new Promise((resolve) => {
    let settled = false
    let authenticated = false

    const finish = (): void => {
      if (settled) return
      settled = true
      resolve({ authenticated })
    }

    const win = new BrowserWindow({
      width: 1120,
      height: 820,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 11 },
      backgroundColor: '#0f0f0f',
      title: 'Notion Login',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nativeWindowOpen: true,
        session: ses,
      },
    })

    win.once('ready-to-show', () => win.show())
    win.on('closed', finish)

    const updateLoginState = (url: string): void => {
      if (!authenticated && isLikelyLoggedInNotionUrl(url)) {
        authenticated = true
        win.setTitle('Notion Connected')
      }
    }

    win.webContents.setUserAgent(CHROME_UA)

    win.webContents.setWindowOpenHandler(() => {
      return {
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
            session: ses,
          },
        },
      }
    })

    win.webContents.on('did-navigate', (_event, url) => updateLoginState(url))
    win.webContents.on('did-redirect-navigation', (_event, url) => updateLoginState(url))
    win.webContents.on('page-title-updated', (_event, title) => {
      if (!authenticated && title) win.setTitle(title)
    })

    void win.loadURL(startUrl, { userAgent: CHROME_UA }).catch(() => {
      if (!win.isDestroyed()) win.close()
      else finish()
    })
  })
}
