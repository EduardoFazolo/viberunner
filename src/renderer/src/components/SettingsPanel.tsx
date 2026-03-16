import React, { useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: Props): React.ReactElement | null {
  const { settings, loaded, load, update } = useSettingsStore()
  const shellRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    if (open) setTimeout(() => shellRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      {/* backdrop — clicking it closes the panel */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
        onMouseDown={onClose}
      />

      {/* drawer */}
      <div
        style={{
          position: 'relative',
          width: 320,
          height: '100%',
          background: '#131313',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-16px 0 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Settings</span>
          <button
            onClick={onClose}
            style={{
              width: 22, height: 22, borderRadius: 5, border: 'none',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9">
              <path d="M1 1l7 7M8 1l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          <Section label="Canvas">
            <SettingRow
              label="Navigation style"
              hint="Default: scroll to pan, Ctrl+scroll to zoom. Trackpad: scroll to zoom, drag to pan."
            >
              <div style={{ display: 'flex', gap: 6 }}>
                {(['default', 'trackpad'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => update({ navStyle: style })}
                    style={{
                      flex: 1,
                      height: 30,
                      borderRadius: 6,
                      border: `1px solid ${settings.navStyle === style ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`,
                      background: settings.navStyle === style ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                      color: settings.navStyle === style ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textTransform: 'capitalize',
                      transition: 'all 0.1s',
                    }}
                  >
                    {style === 'default' ? 'Default' : 'Trackpad'}
                  </button>
                ))}
              </div>
            </SettingRow>
          </Section>

        <Section label="Terminal">
            <SettingRow
              label="Shell"
              hint="Path to shell binary. Leave empty to use system default."
            >
              <input
                ref={shellRef}
                type="text"
                value={settings.shell}
                placeholder="/bin/zsh"
                onChange={(e) => update({ shell: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow
              label="Font size"
              hint="xterm.js font size in pixels."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: '#a78bfa', cursor: 'pointer' }}
                />
                <span style={{
                  fontSize: 12, color: 'rgba(255,255,255,0.55)',
                  minWidth: 26, textAlign: 'right', fontFamily: 'monospace',
                }}>
                  {settings.fontSize}
                </span>
              </div>
            </SettingRow>
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
            Changes apply to new terminals
          </span>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        padding: '0 16px 6px',
        fontSize: 10.5, fontWeight: 600,
        color: 'rgba(255,255,255,0.22)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
      </div>
      {children}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.45 }}>{hint}</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 12,
  padding: '0 10px',
  outline: 'none',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
}
