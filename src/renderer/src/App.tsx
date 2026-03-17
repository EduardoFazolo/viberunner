import React, { useCallback, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar, SIDEBAR_W } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { CommandPalette } from './components/CommandPalette'
import { SettingsPanel } from './components/SettingsPanel'
import { useAutoSave } from './hooks/useAutoSave'
import { useWorkspaceInit } from './hooks/useWorkspaceInit'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App(): React.ReactElement {
  useWorkspaceInit()
  useAutoSave()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])

  useKeyboardShortcuts({ onSearch: openPalette, onSettings: openSettings })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        sidebarWidth={SIDEBAR_W}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{
          width: sidebarOpen ? SIDEBAR_W : 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
          flexShrink: 0,
        }}>
          <Sidebar onOpenSettings={openSettings} />
        </div>
        <div data-canvas-root style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Canvas />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
