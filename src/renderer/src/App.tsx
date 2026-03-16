import React, { useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar, SIDEBAR_W } from './components/Sidebar'
import { TitleBar, TITLEBAR_H } from './components/TitleBar'
import { useAutoSave } from './hooks/useAutoSave'
import { useWorkspaceInit } from './hooks/useWorkspaceInit'

export default function App(): React.ReactElement {
  useWorkspaceInit()
  useAutoSave()

  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        sidebarWidth={SIDEBAR_W}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar slides in/out */}
        <div style={{
          width: sidebarOpen ? SIDEBAR_W : 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
          flexShrink: 0,
        }}>
          <Sidebar />
        </div>

        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Canvas />
        </div>
      </div>
    </div>
  )
}
