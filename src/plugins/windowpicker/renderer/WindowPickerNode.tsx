import React, { useState, useEffect, useCallback, useRef } from 'react'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'

interface DesktopWindow {
  id: number
  name: string
  owner: string
  pid: number
}

const THUMB_PLACEHOLDER: React.CSSProperties = {
  width: 80,
  height: 60,
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.04)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'rgba(255,255,255,0.15)',
  fontSize: 18
}

export function WindowPickerNode({ node }: { node: NodeData }): React.ReactElement {
  const windowId = node.props?.windowId as number | undefined
  const windowOwner = node.props?.windowOwner as string | undefined
  const windowName = node.props?.windowName as string | undefined
  const windowPid = node.props?.windowPid as number | undefined
  const screenshot = node.props?.screenshot as string | undefined

  const [picking, setPicking] = useState(!windowId)
  const [windows, setWindows] = useState<DesktopWindow[]>([])
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { update } = useNodeStore()

  // Block wheel events from reaching the canvas native listener (same pattern as FilesNode)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent): void => {
      e.stopPropagation()
    }
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [picking])

  const loadWindows = useCallback(async () => {
    setLoading(true)
    setThumbnails(new Map())
    try {
      // Fast: get metadata instantly
      const list = await window.windowpicker.listWindows()
      setWindows(list.filter((w) => w.owner !== 'Electron' || !w.name.includes('CanvaFlow')))
      setLoading(false)

      // Slow: load thumbnails in background
      const thumbs = await window.windowpicker.getThumbnails()
      const map = new Map<number, string>()
      for (const t of thumbs) {
        map.set(t.id, t.thumbnail)
      }
      setThumbnails(map)
    } catch (err) {
      console.error('[WindowPicker] Failed to list windows:', err)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (picking) {
      loadWindows()
    }
  }, [picking, loadWindows])

  useEffect(() => {
    if (picking && searchRef.current) {
      searchRef.current.focus()
    }
  }, [picking, windows])

  const selectWindow = useCallback(
    async (win: DesktopWindow) => {
      // Use existing thumbnail as immediate preview, then capture high-res
      const existingThumb = thumbnails.get(win.id)
      update(node.id, {
        props: {
          ...node.props,
          windowId: win.id,
          windowOwner: win.owner,
          windowName: win.name,
          windowPid: win.pid,
          screenshot: existingThumb || null
        },
        title: win.owner ? `${win.owner} — ${win.name || 'Window'}` : win.name || 'Window'
      })
      setPicking(false)

      // Capture high-res in background
      const capture = await window.windowpicker.captureWindow(win.id)
      if (capture) {
        update(node.id, {
          props: {
            ...node.props,
            windowId: win.id,
            windowOwner: win.owner,
            windowName: win.name,
            windowPid: win.pid,
            screenshot: capture
          }
        })
      }
    },
    [node.id, node.props, update, thumbnails]
  )

  const focusWindow = useCallback(async () => {
    if (windowPid || windowOwner) {
      await window.windowpicker.focusWindow(windowPid || 0, windowOwner || '')
    }
  }, [windowPid, windowOwner])

  const refreshScreenshot = useCallback(async () => {
    if (!windowId) return
    const capture = await window.windowpicker.captureWindow(windowId)
    if (capture) {
      update(node.id, { props: { ...node.props, screenshot: capture } })
    }
  }, [windowId, node.id, node.props, update])

  const filtered = windows.filter((w) => {
    if (!search) return true
    const q = search.toLowerCase()
    return w.name.toLowerCase().includes(q) || w.owner.toLowerCase().includes(q)
  })

  if (picking) {
    return (
      <BaseNode node={node}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#0f0f0f',
            color: 'rgba(255,255,255,0.85)'
          }}
        >
          {/* Search bar */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  if (windowId) setPicking(false)
                }
              }}
              placeholder="Search windows..."
              style={{
                width: '100%',
                height: 28,
                fontSize: 12,
                color: 'rgba(255,255,255,0.85)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                padding: '0 8px',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Window list */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflow: 'auto', padding: '4px 6px' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {loading && (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 12
                }}
              >
                Loading windows...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 12
                }}
              >
                {windows.length === 0
                  ? 'No windows found. Screen recording permission may be needed.'
                  : 'No matching windows.'}
              </div>
            )}

            {!loading &&
              filtered.map((w) => {
                const thumb = thumbnails.get(w.id)
                return (
                  <button
                    key={w.id}
                    onClick={() => selectWindow(w)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 5,
                      color: 'rgba(255,255,255,0.8)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      transition: 'background 0.1s'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        style={{
                          width: 80,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.08)',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div style={THUMB_PLACEHOLDER}>
                        <svg
                          width="20"
                          height="16"
                          viewBox="0 0 20 16"
                          fill="none"
                          style={{ opacity: 0.4 }}
                        >
                          <rect
                            x="1"
                            y="1"
                            width="18"
                            height="14"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <path d="M1 4h18" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      </div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {w.name || 'Untitled Window'}
                      </div>
                      {w.owner && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'rgba(167,139,250,0.6)',
                            marginTop: 1
                          }}
                        >
                          {w.owner}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
          </div>

          {/* Refresh / Cancel */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '6px 10px',
              borderTop: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <button
              onClick={loadWindows}
              style={{
                flex: 1,
                height: 26,
                fontSize: 11,
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Refresh
            </button>
            {windowId && (
              <button
                onClick={() => setPicking(false)}
                style={{
                  flex: 1,
                  height: 26,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </BaseNode>
    )
  }

  // Selected window view
  return (
    <BaseNode node={node}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#0f0f0f',
          position: 'relative'
        }}
      >
        {/* Screenshot */}
        <div
          style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
          onClick={focusWindow}
          title="Click to bring window to front"
        >
          {screenshot ? (
            <img
              src={screenshot}
              alt={windowName || 'Window'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 13
              }}
            >
              No screenshot available
            </div>
          )}

          {/* Overlay on hover */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              opacity: 0,
              transition: 'opacity 0.15s',
              pointerEvents: 'none'
            }}
            className="windowpicker-hover-overlay"
          />
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.3)'
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {windowOwner && (
              <span style={{ color: 'rgba(167,139,250,0.7)', marginRight: 6 }}>
                {windowOwner}
              </span>
            )}
            {windowName}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              refreshScreenshot()
            }}
            title="Refresh screenshot"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            &#x21bb;
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPicking(true)
            }}
            title="Change window"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            &#x2026;
          </button>
        </div>
      </div>
    </BaseNode>
  )
}
