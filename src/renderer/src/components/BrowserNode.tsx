import React, { useEffect, useRef, useState, useCallback } from 'react'
import { NodeData, useNodeStore } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { useCameraStore } from '../stores/cameraStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub
} from './ui/context-menu'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: string
        nodeintegration?: string
        disablewebsecurity?: string
        ref?: React.Ref<HTMLElement>
      }
    }
  }
}

const TITLE_H = 32
const TOOLBAR_H = 36

const btnBase: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'rgba(255,255,255,0.25)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}
const btnHover: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.75)',
}

interface Props {
  node: NodeData
}

export function BrowserNode({ node }: Props): React.ReactElement {
  const { update, remove, bringToFront, sendToBack, add } = useNodeStore()
  const webviewRef = useRef<any>(null)

  const [urlBar, setUrlBar] = useState<string>(
    (node.props.url as string) || 'https://google.com'
  )
  const [loading, setLoading] = useState(false)
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  // Track camera zoom without re-rendering on every change
  const cameraZoomRef = useRef(useCameraStore.getState().camera.zoom)
  const [isThumbnailMode, setIsThumbnailMode] = useState(
    useCameraStore.getState().camera.zoom < 0.3
  )

  // Subscribe to camera zoom changes for thumbnail mode
  useEffect(() => {
    const unsub = useCameraStore.subscribe((s) => {
      const zoom = s.camera.zoom
      const wasBelow = cameraZoomRef.current < 0.3
      const isBelow = zoom < 0.3

      // Transitioning from active → thumbnail: capture screenshot
      if (!wasBelow && isBelow) {
        if (webviewRef.current) {
          try {
            ;(webviewRef.current as any)
              .capturePage()
              .then((img: any) => {
                setThumbnail(img.toDataURL())
              })
              .catch(() => {
                // capturePage may fail if webview isn't ready; that's OK
              })
          } catch {
            // ignore
          }
        }
        setIsThumbnailMode(true)
      }

      // Transitioning from thumbnail → active
      if (wasBelow && !isBelow) {
        setIsThumbnailMode(false)
      }

      cameraZoomRef.current = zoom
    })
    return unsub
  }, [])

  // Attach webview event listeners after mount
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStartLoading = () => setLoading(true)

    const onStopLoading = () => {
      setLoading(false)
      if (wv) {
        try {
          const url = (wv as any).getURL()
          if (url) setUrlBar(url)
        } catch {
          // ignore
        }
      }
    }

    const onNavigate = (e: any) => {
      if (e.url) setUrlBar(e.url)
    }

    const onNavigateInPage = (e: any) => {
      if (e.url) setUrlBar(e.url)
    }

    const onTitleUpdated = (e: any) => {
      if (e.title) update(node.id, { title: e.title })
    }

    const onFailLoad = () => setLoading(false)

    const onNewWindow = (e: any) => {
      if (e.preventDefault) e.preventDefault()
      if (e.url) {
        add('browser', node.x + 40, node.y + 40, { url: e.url })
      }
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigateInPage)
    wv.addEventListener('page-title-updated', onTitleUpdated)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('new-window', onNewWindow)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigateInPage)
      wv.removeEventListener('page-title-updated', onTitleUpdated)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('new-window', onNewWindow)
    }
  }, [node.id, node.x, node.y, update, add])

  const handleBack = useCallback(() => {
    if (webviewRef.current) {
      try { ;(webviewRef.current as any).goBack() } catch { /* ignore */ }
    }
  }, [])

  const handleForward = useCallback(() => {
    if (webviewRef.current) {
      try { ;(webviewRef.current as any).goForward() } catch { /* ignore */ }
    }
  }, [])

  const handleReloadStop = useCallback(() => {
    if (!webviewRef.current) return
    try {
      if (loading) {
        ;(webviewRef.current as any).stop()
      } else {
        ;(webviewRef.current as any).reload()
      }
    } catch { /* ignore */ }
  }, [loading])

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        let url = (e.currentTarget as HTMLInputElement).value.trim()
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          // Heuristic: if it looks like a domain, add https://; otherwise search
          if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url
          } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url)
          }
        }
        setUrlBar(url)
        if (webviewRef.current) {
          try { ;(webviewRef.current as any).loadURL(url) } catch { /* ignore */ }
        }
      }
    },
    []
  )

  const webviewHeight = node.height - TITLE_H - TOOLBAR_H

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <BaseNode node={node}>
          {/* Toolbar */}
          <div
            style={{
              height: TOOLBAR_H,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              background: '#161616',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Back */}
            <button
              style={{ ...btnBase }}
              title="Back"
              onClick={handleBack}
              onMouseEnter={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnHover)
              }
              onMouseLeave={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnBase)
              }
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M6 5l-4 4 4 4M2 9h8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </button>

            {/* Forward */}
            <button
              style={{ ...btnBase }}
              title="Forward"
              onClick={handleForward}
              onMouseEnter={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnHover)
              }
              onMouseLeave={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnBase)
              }
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M4 5l4 4-4 4M10 9H2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </button>

            {/* Reload / Stop */}
            <button
              style={{ ...btnBase }}
              title={loading ? 'Stop' : 'Reload'}
              onClick={handleReloadStop}
              onMouseEnter={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnHover)
              }
              onMouseLeave={(e) =>
                Object.assign((e.currentTarget as HTMLElement).style, btnBase)
              }
            >
              {loading ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M3 3l6 6M9 3l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M9 4.5A4.5 4.5 0 1 0 10 8M9 2v3h-3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}
            </button>

            {/* URL input */}
            <input
              type="text"
              value={urlBar}
              onChange={(e) => setUrlBar(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={(e) => {
                ;(e.currentTarget as HTMLInputElement).select()
                ;(e.currentTarget as HTMLInputElement).style.borderColor =
                  'rgba(255,255,255,0.2)'
              }}
              onBlur={(e) => {
                ;(e.currentTarget as HTMLInputElement).style.borderColor =
                  'rgba(255,255,255,0.08)'
              }}
              style={{
                flex: 1,
                height: 22,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11,
                padding: '0 8px',
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            />
          </div>

          {/* Webview area — webview stays mounted always to preserve page state */}
          <div
            style={{ width: '100%', height: webviewHeight, position: 'relative', overflow: 'hidden', background: '#ffffff' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <webview
              ref={webviewRef}
              src={(node.props.url as string) || 'https://google.com'}
              partition="persist:canvaflow-ws-default"
              allowpopups=""
              style={{ width: '100%', height: '100%', display: 'flex' }}
            />
            {/* Thumbnail overlay — sits on top when zoomed out, webview stays alive underneath */}
            {isThumbnailMode && thumbnail && (
              <img
                src={thumbnail}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt="Browser thumbnail"
              />
            )}
          </div>
        </BaseNode>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => update(node.id, { minimized: !node.minimized })}>
          {node.minimized ? 'Restore' : 'Minimize'}
        </ContextMenuItem>
        <ContextMenuSub trigger="Order">
          <ContextMenuItem onClick={() => bringToFront(node.id)}>Bring to Front</ContextMenuItem>
          <ContextMenuItem onClick={() => sendToBack(node.id)}>Send to Back</ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => remove(node.id)}>
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
