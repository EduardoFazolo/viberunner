import React from 'react'
import { useViewStore } from '../stores/viewStore'
import { CanvasView } from '../views/CanvasView'
import { SettingsView } from '../views/SettingsView'

function renderView(type: string): React.ReactElement {
  if (type === 'canvas') return <CanvasView />
  if (type === 'settings') return <SettingsView />
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Unknown view: {type}</div>
}

export function ViewLayer(): React.ReactElement {
  const { instances, activeId } = useViewStore()

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {instances.map((inst) => (
        <div
          key={inst.id}
          style={{
            position: 'absolute',
            inset: 0,
            display: inst.id === activeId ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          {renderView(inst.type)}
        </div>
      ))}
    </div>
  )
}
