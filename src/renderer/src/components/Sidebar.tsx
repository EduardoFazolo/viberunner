import React, { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore, Workspace, NodeSummary } from '../stores/workspaceStore'
import { useNodeStore } from '../stores/nodeStore'
import { loadWorkspaceCanvas } from '../hooks/useWorkspaceInit'

export const SIDEBAR_W = 240

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FolderIcon({ open }: { open: boolean }): React.ReactElement {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"
        fill="rgba(255,255,255,0.25)" stroke="none"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"
        stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function NodeTypeIcon({ type }: { type: string }): React.ReactElement {
  if (type === 'terminal') {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M1.5 3l3 2.5-3 2.5M5.5 8h4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (type === 'browser') {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <rect x="1" y="1" width="9" height="9" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
        <path d="M1 4h9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
        <circle cx="3" cy="2.5" r="0.7" fill="rgba(255,255,255,0.35)"/>
      </svg>
    )
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
    </svg>
  )
}

function PlusIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Add Workspace Dialog
// ---------------------------------------------------------------------------

function AddWorkspaceDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [picking, setPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const pickDir = async () => {
    setPicking(true)
    try {
      const chosen = await window.workspace.openDialog()
      if (chosen) {
        setPath(chosen)
        if (!name) setName(chosen.split('/').pop() || chosen)
      }
    } finally {
      setPicking(false)
    }
  }

  const confirm = async () => {
    if (!path) return
    const displayName = name.trim() || path.split('/').pop() || path
    const ws: Workspace = {
      id: crypto.randomUUID(),
      name: displayName,
      path,
      lastOpenedAt: Date.now(),
      color: null,
    }
    await window.workspace.save(ws)
    useWorkspaceStore.setState((s) => ({
      workspaces: [...s.workspaces, ws],
      activeId: ws.id,
      nodeSummaries: { ...s.nodeSummaries, [ws.id]: [] },
    }))
    await loadWorkspaceCanvas(ws.id)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 20,
        width: 380,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
          Add workspace
        </div>

        <button onClick={pickDir} disabled={picking} style={{
          height: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: path ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
          fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '0 10px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        }}>
          {path || (picking ? 'Choosing…' : 'Choose directory…')}
        </button>

        <input ref={inputRef} type="text" placeholder="Name (optional)"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onClose() }}
          style={{
            height: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
            fontSize: 12, padding: '0 10px', outline: 'none', fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={confirm} disabled={!path} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: 'none', background: path ? '#a78bfa' : 'rgba(167,139,250,0.3)',
            color: '#fff', fontSize: 12, cursor: path ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>Add</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm
// ---------------------------------------------------------------------------

function DeleteConfirm({ workspace, onConfirm, onCancel }: {
  workspace: Workspace; onConfirm: () => void; onCancel: () => void
}): React.ReactElement {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)',
    }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: 20, width: 340,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          Remove workspace?
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>{workspace.name}</span> will be removed.
          The directory on disk is not affected.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: 'none', background: 'rgba(239,68,68,0.8)',
            color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Remove</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSection
// ---------------------------------------------------------------------------

interface SectionProps {
  workspace: Workspace
  isActive: boolean
  nodes: NodeSummary[]
  onSwitch: () => void
  onDelete: () => void
}

function WorkspaceSection({ workspace, isActive, nodes, onSwitch, onDelete }: SectionProps): React.ReactElement {
  const [open, setOpen] = useState(isActive)
  const [headerHovered, setHeaderHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)

  // Auto-expand when becoming active
  useEffect(() => { if (isActive) setOpen(true) }, [isActive])

  return (
    <div style={{ width: '100%' }}>
      {/* Workspace header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px 0 8px',
          cursor: 'pointer',
          background: isActive && headerHovered
            ? 'rgba(255,255,255,0.07)'
            : headerHovered
              ? 'rgba(255,255,255,0.05)'
              : 'transparent',
          borderRadius: 5,
          margin: '0 4px',
          position: 'relative',
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        onClick={() => { setOpen((o) => !o); if (!isActive) onSwitch() }}
      >
        {/* Active indicator */}
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 2.5, height: 16, borderRadius: 2, background: '#a78bfa',
          }} />
        )}

        <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
          <ChevronIcon open={open} />
        </span>

        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <FolderIcon open={open} />
        </span>

        <span style={{
          flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400,
          color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.5)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}>
          {workspace.name}
        </span>

        {/* Delete button — only on hover */}
        {headerHovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            style={{
              width: 16, height: 16, borderRadius: 4, border: 'none',
              background: deleteHovered ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: deleteHovered ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0,
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Node items */}
      {open && (
        <div style={{ paddingLeft: 4 }}>
          {nodes.length === 0 ? (
            <div style={{
              padding: '4px 12px 4px 34px',
              fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
            }}>
              No sessions
            </div>
          ) : (
            nodes.map((node) => (
              <NodeItem key={node.id} node={node} workspaceActive={isActive} onSwitchWorkspace={onSwitch} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NodeItem
// ---------------------------------------------------------------------------

function NodeItem({ node, workspaceActive, onSwitchWorkspace }: {
  node: NodeSummary
  workspaceActive: boolean
  onSwitchWorkspace: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 26, padding: '0 8px 0 28px',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderRadius: 5,
        margin: '0 4px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (!workspaceActive) onSwitchWorkspace() }}
    >
      <NodeTypeIcon type={node.type} />
      <span style={{
        flex: 1, fontSize: 11.5,
        color: hovered ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.38)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {node.title}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar(): React.ReactElement {
  const { workspaces, activeId, setActive, removeWorkspace, touchWorkspace, nodeSummaries, setNodeSummaries } =
    useWorkspaceStore()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Keep active workspace's node summaries in sync with live nodeStore
  useEffect(() => {
    const unsub = useNodeStore.subscribe((state) => {
      const id = useWorkspaceStore.getState().activeId
      if (!id) return
      const summaries = Array.from(state.nodes.values()).map((n) => ({
        id: n.id, title: n.title, type: n.type,
      }))
      setNodeSummaries(id, summaries)
    })
    return unsub
  }, [setNodeSummaries])

  const handleSwitch = async (id: string) => {
    if (id === activeId) return
    touchWorkspace(id)
    setActive(id)
    await loadWorkspaceCanvas(id)
    await window.appState.set('lastWorkspaceId', id)
  }

  const handleDelete = async (id: string) => {
    await window.workspace.delete(id)
    removeWorkspace(id)
    setConfirmDeleteId(null)
  }

  return (
    <>
      <div style={{
        width: SIDEBAR_W,
        height: '100%',
        background: '#111111',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Section label + add button */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '8px 12px 6px 12px',
          flexShrink: 0,
        }}>
          <span style={{
            flex: 1, fontSize: 10.5, fontWeight: 600,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Workspaces
          </span>
          <AddIconButton onClick={() => setShowAdd(true)} />
        </div>

        {/* Workspace list */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '2px 0 12px 0',
        }}>
          {workspaces.map((ws) => (
            <WorkspaceSection
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeId}
              nodes={nodeSummaries[ws.id] ?? []}
              onSwitch={() => handleSwitch(ws.id)}
              onDelete={() => setConfirmDeleteId(ws.id)}
            />
          ))}

          {workspaces.length === 0 && (
            <div style={{
              padding: '20px 16px', fontSize: 12,
              color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6,
            }}>
              No workspaces yet.{'\n'}Click + to add one.
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddWorkspaceDialog onClose={() => setShowAdd(false)} />}
      {confirmDeleteId && (
        <DeleteConfirm
          workspace={workspaces.find((w) => w.id === confirmDeleteId)!}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  )
}

function AddIconButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title="Add workspace"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0, transition: 'background 0.1s, color 0.1s',
      }}
    >
      <PlusIcon />
    </button>
  )
}
