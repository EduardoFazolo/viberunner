import React, { useEffect } from 'react'
import { useMaestroStore } from '../maestroStore'

export function MaestroSettingsSection(): React.ReactElement {
  const { settings, loaded, load, update } = useMaestroStore()

  useEffect(() => { if (!loaded) void load() }, [loaded, load])

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>Maestro</span>
        <Toggle value={settings.enabled} onChange={(v) => update({ enabled: v })} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>
        Control the canvas with your hands via webcam. Open palm to pan, point up to zoom. Clap to switch controlling hand.
      </span>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 10,
        border: 'none', background: value ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.1)',
        cursor: 'pointer', padding: 0, transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s', display: 'block',
      }} />
    </button>
  )
}
