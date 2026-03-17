import { Session } from 'electron'

export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const configured = new WeakSet<Session>()

/**
 * Apply Chrome UA + strip framing/opener headers for a session.
 * Safe to call multiple times — idempotent via WeakSet guard.
 */
export function setupBrowserSession(ses: Session): void {
  if (configured.has(ses)) return
  configured.add(ses)

  ses.setUserAgent(CHROME_UA)

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(details.responseHeaders ?? {})) {
      headers[k.toLowerCase()] = v as string[]
    }

    // Prevent sites from refusing to load in a webview frame
    delete headers['x-frame-options']

    // Preserve window.opener across cross-origin popups (needed for OAuth)
    delete headers['cross-origin-opener-policy']
    delete headers['cross-origin-embedder-policy']

    // Strip frame-ancestors directive from CSP
    if (headers['content-security-policy']) {
      headers['content-security-policy'] = headers['content-security-policy'].map((csp) =>
        csp.replace(/frame-ancestors[^;]*(;|$)\s*/gi, '').trim()
      )
    }

    callback({ responseHeaders: headers })
  })
}
