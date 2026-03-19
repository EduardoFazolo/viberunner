import React, { useEffect, useMemo, useRef, useState } from 'react'
import MiniSearch from 'minisearch'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useNodeStore, NodeData } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { loadWorkspaceCanvas } from '../hooks/useWorkspaceInit'
import { getCanvasRect } from '../utils/canvasUtils'

interface Props {
  open: boolean
  onClose: () => void
}

interface SearchDoc {
  id: string           // workspaceId:nodeId
  nodeId: string
  workspaceId: string
  workspaceName: string
  title: string
  type: string
  subtitle: string
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'terminal') {
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.07)', padding: '2px 5px', borderRadius: 4 }}>
        &gt;_
      </span>
    )
  }
  if (type === 'browser') {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
        <rect x="1" y="1" width="11" height="11" rx="2.5" stroke="white" strokeWidth="1.2"/>
        <path d="M1 4.5h11" stroke="white" strokeWidth="1.2"/>
        <circle cx="3.5" cy="2.8" r="0.8" fill="white"/>
      </svg>
    )
  }
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="white" strokeWidth="1.2"/>
    </svg>
  )
}

function jumpToNode(node: NodeData): void {
  const zoom = Math.max(useCameraStore.getState().camera.zoom, 0.7)
  const { width: vw, height: vh } = getCanvasRect()
  useCameraStore.getState().setCamera({
    zoom,
    x: vw / 2 - (node.x + node.width / 2) * zoom,
    y: vh / 2 - (node.y + node.height / 2) * zoom,
  })
}

export function CommandPalette({ open, onClose }: Props): React.ReactElement | null {
  const { workspaces, nodeSummaries, activeId, setActive, touchWorkspace } = useWorkspaceStore()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build MiniSearch index whenever nodeSummaries or workspaces change
  const miniSearch = useMemo(() => {
    const ms = new MiniSearch<SearchDoc>({
      fields: ['title', 'subtitle', 'workspaceName'],
      storeFields: ['nodeId', 'workspaceId', 'workspaceName', 'title', 'type', 'subtitle'],
      searchOptions: {
        boost: { title: 3 },
        fuzzy: 0.25,
        prefix: true,
      },
    })
    const docs: SearchDoc[] = []
    for (const [wsId, nodes] of Object.entries(nodeSummaries)) {
      const ws = workspaces.find(w => w.id === wsId)
      if (!ws) continue
      for (const node of nodes) {
        docs.push({
          id: `${wsId}:${node.id}`,
          nodeId: node.id,
          workspaceId: wsId,
          workspaceName: ws.name,
          title: node.title,
          type: node.type,
          subtitle: node.subtitle ?? '',
        })
      }
    }
    ms.addAll(docs)
    return ms
  }, [nodeSummaries, workspaces])

  // All docs for empty query (show everything, active workspace first)
  const allDocs = useMemo<SearchDoc[]>(() => {
    const docs: SearchDoc[] = []
    // Active workspace first
    const orderedWsIds = [
      ...(activeId ? [activeId] : []),
      ...workspaces.filter(w => w.id !== activeId).map(w => w.id),
    ]
    for (const wsId of orderedWsIds) {
      const ws = workspaces.find(w => w.id === wsId)
      if (!ws) continue
      for (const node of nodeSummaries[wsId] ?? []) {
        docs.push({
          id: `${wsId}:${node.id}`,
          nodeId: node.id,
          workspaceId: wsId,
          workspaceName: ws.name,
          title: node.title,
          type: node.type,
          subtitle: node.subtitle ?? '',
        })
      }
    }
    return docs
  }, [nodeSummaries, workspaces, activeId])

  const results = useMemo<SearchDoc[]>(() => {
    const q = query.trim()
    if (!q) return allDocs
    return miniSearch.search(q) as unknown as SearchDoc[]
  }, [query, miniSearch, allDocs])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const select = async (doc: SearchDoc) => {
    onClose()
    if (doc.workspaceId !== activeId) {
      touchWorkspace(doc.workspaceId)
      setActive(doc.workspaceId)
      await loadWorkspaceCanvas(doc.workspaceId)
      await window.appState.set('lastWorkspaceId', doc.workspaceId)
    }
    const node = useNodeStore.getState().nodes.get(doc.nodeId)
    if (node) jumpToNode(node)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) { select(results[activeIdx]) }
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />

      <div
        style={{
          position: 'relative',
          width: 580,
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
            placeholder="Search across all workspaces…"
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

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}>
          {results.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
              No results
            </div>
          ) : (
            results.map((doc, i) => {
              const isActive = i === activeIdx
              const isCrossWorkspace = doc.workspaceId !== activeId
              return (
                <div
                  key={doc.id}
                  onMouseDown={() => select(doc)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    height: doc.subtitle ? 48 : 40,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 16px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  }}
                >
                  <TypeIcon type={doc.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.title}
                    </div>
                    {doc.subtitle && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {doc.subtitle}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {isCrossWorkspace && (
                      <span style={{ fontSize: 10, color: 'rgba(167,139,250,0.7)', background: 'rgba(167,139,250,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                        {doc.workspaceName}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textTransform: 'capitalize' }}>
                      {doc.type}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {results.length > 0 && (
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
