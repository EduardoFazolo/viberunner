import React, { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function SettingsView(): React.ReactElement {
  const { settings, loaded, load, update } = useSettingsStore()

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  return (
    <div style={{
      flex: 1, width: '100%', height: '100%',
      overflowY: 'auto', background: '#0d0d0d',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 560, padding: '36px 32px' }}>

        <div style={{
          fontSize: 15, fontWeight: 600,
          color: 'rgba(255,255,255,0.82)',
          marginBottom: 28,
          letterSpacing: '-0.01em',
        }}>
          Settings
        </div>

        {loaded && (
          <>
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
                        flex: 1, height: 30, borderRadius: 6,
                        border: `1px solid ${settings.navStyle === style ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`,
                        background: settings.navStyle === style ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                        color: settings.navStyle === style ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'capitalize', transition: 'all 0.1s',
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
                  type="text"
                  value={settings.shell}
                  placeholder="/bin/zsh"
                  onChange={(e) => update({ shell: e.target.value })}
                  style={inputStyle}
                />
              </SettingRow>

              <SettingRow
                label="Font size"
                hint="xterm.js font size in pixels."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range" min={8} max={24} step={1}
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
          </>
        )}

        <div style={{ marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>
          Changes apply to new terminals
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: 'rgba(255,255,255,0.22)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{label}</span>
      {children}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>{hint}</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 30, borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.8)', fontSize: 12,
  padding: '0 10px', outline: 'none',
  fontFamily: 'monospace', boxSizing: 'border-box',
}
