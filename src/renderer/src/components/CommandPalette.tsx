import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNodeStore, NodeData } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'

interface Props {
  open: boolean
  onClose: () => void
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'terminal') {
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.07)', padding: '2px 5px', borderRadius: 4 }}>
        &gt;_
      </span>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ opacity: 0.35, flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.2" fill="none"/>
      <ellipse cx="7" cy="7" rx="2.5" ry="5.5" stroke="white" strokeWidth="1.2" fill="none"/>
      <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="white" strokeWidth="1.2"/>
    </svg>
  )
}

function jumpToNode(node: NodeData): void {
  const zoom = Math.max(useCameraStore.getState().camera.zoom, 0.7)
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  useCameraStore.getState().setCamera({
    zoom,
    x: vw / 2 - (node.x + node.width / 2) * zoom,
    y: vh / 2 - (node.y + (node.minimized ? 16 : node.height / 2)) * zoom,
  })
}

export function CommandPalette({ open, onClose }: Props): React.ReactElement | null {
  const nodeMap = useNodeStore(s => s.nodes)
  const allNodes = useMemo(() => Array.from(nodeMap.values()), [nodeMap])
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? allNodes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.type.toLowerCase().includes(query.toLowerCase())
      )
    : allNodes

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => { setActiveIdx(0) }, [query])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const active = listRef.current.children[activeIdx] as HTMLElement | undefined
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const select = (node: NodeData) => {
    onClose()
    jumpToNode(node)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[activeIdx]) { select(filtered[activeIdx]) }
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />

      {/* modal */}
      <div
        style={{
          position: 'relative',
          width: 560,
          maxWidth: 'calc(100vw - 40px)',
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ opacity: 0.3, flexShrink: 0, marginRight: 10 }}>
            <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.3" fill="none"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search nodes..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              padding: '14px 0',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', padding: '3px 7px', borderRadius: 4, flexShrink: 0 }}>
            ESC
          </span>
        </div>

        {/* Node list */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
              No nodes found
            </div>
          ) : (
            filtered.map((node, i) => (
              <div
                key={node.id}
                onMouseDown={() => select(node)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 16px',
                  cursor: 'pointer',
                  background: i === activeIdx ? 'rgba(255,255,255,0.07)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <TypeIcon type={node.type} />
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.title}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', flexShrink: 0, textTransform: 'capitalize' }}>
                  {node.type}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        {filtered.length > 0 && (
          <div style={{ padding: '6px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
            {[['↑↓', 'navigate'], ['↵', 'jump to'], ['esc', 'close']].map(([key, label]) => (
              <span key={key} style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace' }}>{key}</span>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
