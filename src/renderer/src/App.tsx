import React from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { useAutoSave } from './hooks/useAutoSave'
import { useWorkspaceInit } from './hooks/useWorkspaceInit'

export default function App(): React.ReactElement {
  useWorkspaceInit()
  useAutoSave()

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Canvas />
      </div>
    </div>
  )
}
