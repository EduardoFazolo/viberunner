import React, { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { plugins } from '../../../plugins'

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

            <Section label="Enhancements">
              {plugins.map((p) => p.SettingsSection ? <p.SettingsSection key={p.id} /> : null)}
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

        <McpSection />

        <div style={{ marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>
          Changes apply to new terminals
        </div>
      </div>
    </div>
  )
}

function McpSection(): React.ReactElement {
  // Lovable MCP state
  const [lovableInstalled, setLovableInstalled] = useState<boolean | null>(null)
  const [lovableInstalling, setLovableInstalling] = useState(false)

  const checkLovable = useCallback(async () => {
    const result = await window.lovable.checkMcpGlobal()
    setLovableInstalled(result)
  }, [])

  useEffect(() => { checkLovable() }, [checkLovable])

  const installLovable = async () => {
    setLovableInstalling(true)
    try {
      await window.lovable.installMcpGlobal()
      await checkLovable()
    } finally {
      setLovableInstalling(false)
    }
  }

  // Voice MCP state
  const [handyInstalled, setHandyInstalled] = useState<boolean | null>(null)
  const [handyInstalling, setHandyInstalling] = useState(false)
  const [bridgePath, setBridgePath] = useState<string | null>(null)

  const checkHandy = useCallback(async () => {
    const result = await window.voice.checkHandy()
    setHandyInstalled(result)
    if (result) {
      const { bridgeScriptPath } = await window.voice.setup()
      setBridgePath(bridgeScriptPath)
    }
  }, [])

  useEffect(() => { checkHandy() }, [checkHandy])

  const installHandy = async () => {
    setHandyInstalling(true)
    try {
      await window.voice.installHandy()
      await checkHandy()
    } finally {
      setHandyInstalling(false)
    }
  }

  return (
    <Section label="MCPs">
      {/* Lovable MCP */}
      <McpRow
        icon="🔥"
        name="Lovable MCP"
        description="Lets Claude send prompts to Lovable"
        installed={lovableInstalled}
        installing={lovableInstalling}
        onInstall={installLovable}
        accentColor="#fb923c"
      />

      {/* Voice Commands MCP */}
      <McpRow
        icon="🎙"
        name="Voice Commands"
        description="Dictate (⌘⇧V) or command (⌘⇧M) via Handy + Whisper"
        installed={handyInstalled}
        installing={handyInstalling}
        onInstall={installHandy}
        accentColor="#a78bfa"
      />
      {handyInstalled && bridgePath && (
        <div style={{
          padding: '8px 16px 12px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
            Set Handy's paste method to <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>external_script</span> and
            point it to:
          </div>
          <div style={{
            marginTop: 6, padding: '6px 10px', borderRadius: 5,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.55)',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}>
            {bridgePath}
          </div>
        </div>
      )}
    </Section>
  )
}

function McpRow({ icon, name, description, installed, installing, onInstall, accentColor }: {
  icon: string; name: string; description: string
  installed: boolean | null; installing: boolean
  onInstall: () => void; accentColor: string
}): React.ReactElement {
  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            {description}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {installed === null ? (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>checking…</span>
        ) : installed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 6px #4ade80',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Installed</span>
          </div>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            style={{
              height: 28, padding: '0 14px', borderRadius: 6, fontSize: 11,
              border: `1px solid ${accentColor}66`,
              background: `${accentColor}1a`,
              color: installing ? 'rgba(255,255,255,0.3)' : accentColor,
              cursor: installing ? 'default' : 'pointer',
              fontFamily: 'inherit', fontWeight: 500,
              transition: 'all 0.1s',
            }}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
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

function SettingRow({ label, hint, children, inline }: { label: string; hint: string; children: React.ReactNode; inline?: boolean }): React.ReactElement {
  if (inline) {
    return (
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{label}</span>
          {children}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>{hint}</span>
      </div>
    )
  }
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        background: value ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.1)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: value ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s',
        display: 'block',
      }} />
    </button>
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
