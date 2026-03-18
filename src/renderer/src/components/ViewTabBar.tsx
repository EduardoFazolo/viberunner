import React from 'react'
import { useViewStore } from '../stores/viewStore'

export const VIEW_TABBAR_H = 28

function CanvasTabIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M2.5 3.5h5M2.5 5h5M2.5 6.5h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}

function SettingsTabIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M5 0.5v1M5 8.5v1M0.5 5h1M8.5 5h1M1.9 1.9l.7.7M7.4 7.4l.7.7M8.1 1.9l-.7.7M2.6 7.4l-.7.7"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function tabIcon(type: string): React.ReactElement {
  if (type === 'canvas') return <CanvasTabIcon />
  if (type === 'settings') return <SettingsTabIcon />
  return <CanvasTabIcon />
}

export function ViewTabBar(): React.ReactElement {
  const { instances, activeId, activate, close } = useViewStore()

  return (
    <div style={{
      height: VIEW_TABBAR_H,
      display: 'flex',
      alignItems: 'stretch',
      background: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {instances.map((inst) => {
        const isActive = inst.id === activeId
        return (
          <div
            key={inst.id}
            onClick={() => activate(inst.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 11px',
              cursor: 'pointer',
              userSelect: 'none',
              position: 'relative',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)',
              fontSize: 11,
              fontWeight: isActive ? 500 : 400,
              whiteSpace: 'nowrap',
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'
            }}
          >
            {/* Active indicator line at bottom */}
            {isActive && (
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: 1.5,
                background: '#a78bfa',
                borderRadius: '1px 1px 0 0',
              }} />
            )}

            <span style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
              {tabIcon(inst.type)}
            </span>

            {inst.label}

            {inst.closeable && (
              <button
                onClick={(e) => { e.stopPropagation(); close(inst.id) }}
                style={{
                  width: 13, height: 13,
                  border: 'none', background: 'transparent',
                  color: 'rgba(255,255,255,0.25)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, borderRadius: 3, flexShrink: 0, marginLeft: 2,
                }}
                onMouseEnter={(e) => {
                  Object.assign((e.currentTarget as HTMLElement).style, { color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.1)' })
                }}
                onMouseLeave={(e) => {
                  Object.assign((e.currentTarget as HTMLElement).style, { color: 'rgba(255,255,255,0.25)', background: 'transparent' })
                }}
              >
                <svg width="7" height="7" viewBox="0 0 7 7">
                  <path d="M1 1l5 5M6 1l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
