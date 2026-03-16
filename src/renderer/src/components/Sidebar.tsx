import React, { useState, useRef } from 'react'
import { useWorkspaceStore, Workspace } from '../stores/workspaceStore'
import { loadWorkspaceCanvas } from '../hooks/useWorkspaceInit'

// ---------------------------------------------------------------------------
// Accent colors for workspaces
// ---------------------------------------------------------------------------

const ACCENT_COLORS = [
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#4ade80', // green
  '#fbbf24', // amber
  '#f87171', // red
  '#22d3ee', // cyan
  '#c084fc', // purple
  '#fb923c', // orange
]

let colorIndex = 0
function nextColor(): string {
  const c = ACCENT_COLORS[colorIndex % ACCENT_COLORS.length]
  colorIndex++
  return c
}

// ---------------------------------------------------------------------------
// Add Workspace Dialog
// ---------------------------------------------------------------------------

interface AddDialogProps {
  onClose: () => void
}

function AddWorkspaceDialog({ onClose }: AddDialogProps): React.ReactElement | null {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [picking, setPicking] = useState(false)

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
    const color = nextColor()
    const ws: Workspace = {
      id: crypto.randomUUID(),
      name: displayName,
      path,
      lastOpenedAt: Date.now(),
      color,
    }
    // Persist to DB then update store
    await window.workspace.save(ws)
    useWorkspaceStore.setState((s) => ({
      workspaces: [...s.workspaces, ws],
      activeId: ws.id,
    }))
    await loadWorkspaceCanvas(ws.id)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: 24,
          width: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          Add Workspace
        </div>

        <button
          onClick={pickDir}
          disabled={picking}
          style={{
            height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
            fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '0 12px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {path || (picking ? 'Choosing…' : 'Choose directory…')}
        </button>

        <input
          type="text"
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
            fontSize: 12, padding: '0 12px', outline: 'none',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              height: 32, padding: '0 14px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!path}
            style={{
              height: 32, padding: '0 14px', borderRadius: 6,
              border: 'none', background: '#a78bfa',
              color: '#fff', fontSize: 12, cursor: path ? 'pointer' : 'default',
              opacity: path ? 1 : 0.4,
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

const SIDEBAR_W = 52

export function Sidebar(): React.ReactElement {
  const { workspaces, activeId, setActive, removeWorkspace, touchWorkspace } = useWorkspaceStore()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
      <div
        style={{
          width: SIDEBAR_W,
          height: '100%',
          background: '#0f0f0f',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 12,
          gap: 4,
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        {/* App logo */}
        <div
          style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
            borderRadius: 8,
            marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.6"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.6"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.3"/>
          </svg>
        </div>

        {/* Workspace list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', overflowY: 'auto', width: '100%' }}>
          {workspaces.map((ws) => (
            <WorkspaceButton
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeId}
              onSwitch={() => handleSwitch(ws.id)}
              onDelete={() => setConfirmDeleteId(ws.id)}
            />
          ))}
        </div>

        {/* Add workspace button */}
        <AddButton onClick={() => setShowAdd(true)} />
      </div>

      {showAdd && <AddWorkspaceDialog onClose={() => setShowAdd(false)} />}

      {confirmDeleteId && (
        <DeleteConfirmDialog
          workspace={workspaces.find((w) => w.id === confirmDeleteId)!}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceButton
// ---------------------------------------------------------------------------

interface WBProps {
  workspace: Workspace
  isActive: boolean
  onSwitch: () => void
  onDelete: () => void
}

function WorkspaceButton({ workspace, isActive, onSwitch, onDelete }: WBProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const initials = workspace.name.slice(0, 2).toUpperCase()
  const color = workspace.color || '#a78bfa'

  return (
    <div
      style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}
      title={workspace.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div
          style={{
            position: 'absolute', left: -8, top: '50%',
            transform: 'translateY(-50%)',
            width: 3, height: 20, borderRadius: 2,
            background: color,
          }}
        />
      )}

      <button
        onClick={onSwitch}
        style={{
          width: 36, height: 36,
          borderRadius: isActive ? 10 : 18,
          background: isActive ? color : (hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'),
          border: 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
          transition: 'border-radius 0.15s, background 0.15s',
        }}
      >
        {initials}
      </button>

      {/* Delete button on hover, only if not last workspace */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14, borderRadius: '50%',
            background: 'rgba(239,68,68,0.85)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="6" height="6" viewBox="0 0 6 6">
            <path d="M1 1l4 4M5 1l-4 4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add button
// ---------------------------------------------------------------------------

function AddButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title="Add workspace"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: '1.5px dashed rgba(255,255,255,0.2)',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: 'rgba(255,255,255,0.4)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.1s',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteProps {
  workspace: Workspace
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmDialog({ workspace, onConfirm, onCancel }: DeleteProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: 24,
          width: 360,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          Remove workspace?
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{workspace.name}</strong> will be removed
          from CanvaFlow. The directory on disk will not be deleted.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: '0 14px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: '0 14px', borderRadius: 6,
              border: 'none', background: 'rgba(239,68,68,0.85)',
              color: '#fff', fontSize: 12, cursor: 'pointer',
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
