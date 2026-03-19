import React, { useEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useActivityStore } from '../stores/activityStore'
import { useNodeStore } from '../stores/nodeStore'

export const TITLEBAR_H = 40
const TRAFFIC_W = 74 // space for ⬤⬤⬤

// Inject pulse keyframe once
let _stylesInjected = false
function ensureStyles() {
  if (_stylesInjected) return
  _stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes cf-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.75); }
    }
    @keyframes cf-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
}

interface ActivityDotProps {
  color: string
  delay: number
}

function ActivityDot({ color, delay }: ActivityDotProps): React.ReactElement {
  return (
    <span style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: color,
      animation: `cf-pulse 1.6s ease-in-out ${delay}ms infinite`,
      flexShrink: 0,
    }} />
  )
}

interface Props {
  sidebarOpen: boolean
  sidebarWidth: number
  onToggleSidebar: () => void
}

export function TitleBar({ sidebarOpen, sidebarWidth, onToggleSidebar }: Props): React.ReactElement {
  useEffect(() => { ensureStyles() }, [])

  const { workspaces, activeId } = useWorkspaceStore()
  const activeWs = workspaces.find((w) => w.id === activeId)
  const { activeNodes } = useActivityStore()
  const { nodes } = useNodeStore()

  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  const activeCount = activeNodes.size
  const activeList = Array.from(activeNodes.entries())

  // Map nodeType → accent color
  const getNodeColor = (nodeId: string): string => {
    const node = nodes.get(nodeId)
    const colors: Record<string, string> = {
      terminal: '#4ade80',
      claude: '#a78bfa',
      browser: '#60a5fa',
      monaco: '#fbbf24',
      notion: '#e5e5e5',
      trello: '#0052cc',
      files: '#94a3b8',
      note: '#fb923c',
    }
    return node ? (colors[node.type] ?? '#a78bfa') : '#a78bfa'
  }

  // Show up to 3 dots, then a +N badge
  const visibleDots = activeList.slice(0, 3)
  const overflow = activeCount - visibleDots.length

  return (
    <div style={{
      height: TITLEBAR_H,
      display: 'flex',
      flexShrink: 0,
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
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Traffic light placeholder */}
        <div style={{ width: TRAFFIC_W, flexShrink: 0 }} />

        {/* Sidebar toggle */}
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

      {/* ── Right section: workspace info + activity ── */}
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
        {/* Workspace name + path */}
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

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Activity indicator ── */}
        {activeCount > 0 && (
          <div
            ref={triggerRef}
            onClick={() => setPopoverOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px 3px 7px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background 0.15s ease, border-color 0.15s ease',
              position: 'relative',
              WebkitAppRegion: 'no-drag' as any,
              animation: 'cf-fade-in 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            {/* Animated dots */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {visibleDots.map(([id], i) => (
                <ActivityDot
                  key={id}
                  color={getNodeColor(id)}
                  delay={i * 200}
                />
              ))}
              {overflow > 0 && (
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  lineHeight: 1,
                }}>
                  +{overflow}
                </span>
              )}
            </div>

            {/* Label */}
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.01em',
            }}>
              {activeCount === 1 ? '1 working' : `${activeCount} working`}
            </span>

            {/* Popover */}
            {popoverOpen && (
              <div
                ref={popoverRef}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: 220,
                  background: '#161616',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '6px 0',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  zIndex: 999,
                  animation: 'cf-fade-in 0.15s ease',
                }}
              >
                <div style={{
                  padding: '4px 12px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.3)',
                }}>
                  Active nodes
                </div>
                {activeList.map(([nodeId, activity]) => {
                  const node = nodes.get(nodeId)
                  const color = getNodeColor(nodeId)
                  return (
                    <div key={nodeId} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 12px',
                    }}>
                      <span style={{
                        width: 7, height: 7,
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                        animation: 'cf-pulse 1.6s ease-in-out infinite',
                      }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: 12,
                          color: 'rgba(255,255,255,0.75)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {node?.title ?? nodeId.slice(0, 8)}
                        </div>
                        {activity.label && (
                          <div style={{
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.35)',
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {activity.label}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.2)',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        flexShrink: 0,
                      }}>
                        {node?.type}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
