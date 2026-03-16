import React from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspaceStore'

export const TITLEBAR_H = 40
const TRAFFIC_W = 74 // space for ⬤⬤⬤

interface Props {
  sidebarOpen: boolean
  sidebarWidth: number
  onToggleSidebar: () => void
}

export function TitleBar({ sidebarOpen, sidebarWidth, onToggleSidebar }: Props): React.ReactElement {
  const { workspaces, activeId } = useWorkspaceStore()
  const activeWs = workspaces.find((w) => w.id === activeId)

  return (
    <div style={{
      height: TITLEBAR_H,
      display: 'flex',
      flexShrink: 0,
      // Whole bar draggable
      WebkitAppRegion: 'drag' as any,
      position: 'relative',
      zIndex: 200,
    }}>
      {/* ── Left section: seamless with sidebar ── */}
      <div style={{
        width: sidebarOpen ? sidebarWidth : TRAFFIC_W + 48,
        background: '#111111',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        transition: 'width 0.2s ease',
        // border-bottom only under the sidebar portion
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Traffic light placeholder */}
        <div style={{ width: TRAFFIC_W, flexShrink: 0 }} />

        {/* Sidebar toggle — no-drag so click works */}
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          style={{
            width: 24, height: 24,
            border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.35)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4,
            padding: 0,
            WebkitAppRegion: 'no-drag' as any,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>
      </div>

      {/* ── Right section: workspace info ── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        background: '#0d0d0d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        WebkitAppRegion: 'no-drag' as any,
      }}>
        {activeWs ? (
          <>
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: 'rgba(255,255,255,0.72)',
              whiteSpace: 'nowrap',
            }}>
              {activeWs.name}
            </span>
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.22)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>
              {activeWs.path}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
            No workspace
          </span>
        )}
      </div>
    </div>
  )
}
