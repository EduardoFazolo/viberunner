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

function parseGitHubRepo(url: string): { owner: string; repo: string; cloneUrl: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const skip = ['login', 'signup', 'explore', 'trending', 'marketplace', 'orgs', 'settings']
    if (skip.includes(parts[0])) return null
    const [owner, repo] = parts
    const repoName = repo.replace(/\.git$/, '')
    return { owner, repo: repoName, cloneUrl: `https://github.com/${owner}/${repoName}.git` }
  } catch {
    return null
  }
}

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
  const { update, remove, bringToFront, sendToBack, add, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const webviewRef = useRef<any>(null)
  const webviewAreaRef = useRef<HTMLDivElement>(null)

  // Frozen on mount — changing this ref never re-navigates the webview
  const initialUrl = useRef<string>((node.props.url as string) || 'https://google.com')

  const [urlBar, setUrlBar] = useState<string>(initialUrl.current)
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
          if (url) {
            setUrlBar(url)
            update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url } })
          }
        } catch {
          // ignore
        }
      }
    }

    const onNavigate = (e: any) => {
      if (e.url) {
        setUrlBar(e.url)
        update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url: e.url } })
      }
    }

    const onNavigateInPage = (e: any) => {
      if (e.url) {
        setUrlBar(e.url)
        update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url: e.url } })
      }
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
        <BaseNode node={node} titleExtra={(() => {
              const gh = parseGitHubRepo(urlBar)
              if (!gh) return null
              return (
                <div
                  draggable
                  title={`Drag to a Files node to clone ${gh.owner}/${gh.repo}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/canvaflow-repo', JSON.stringify(gh))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0 6px', height: 18, borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 10, fontWeight: 500,
                    cursor: 'grab', flexShrink: 0, userSelect: 'none',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  {gh.repo}
                </div>
              )
            })()}>
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
            ref={webviewAreaRef}
            style={{ width: '100%', height: webviewHeight, position: 'relative', overflow: 'hidden', background: '#ffffff' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <webview
              ref={webviewRef}
              src={initialUrl.current}
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
            {/* Focus guard — blocks input to webview when not active, letting wheel events bubble to canvas */}
            {focusedNodeId !== node.id && (
              <div
                style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setFocusedNodeId(node.id)
                  setTimeout(() => (webviewRef.current as any)?.focus(), 0)
                }}
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
