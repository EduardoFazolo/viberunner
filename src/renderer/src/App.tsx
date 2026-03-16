import React from 'react'
import { Canvas } from './components/Canvas'
import { useNodeStore } from './stores/nodeStore'

export default function App(): React.ReactElement {
  const nodeCount = useNodeStore((s) => s.nodes.size)
  return (
    <>
      <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 99999, background: '#1a1a2e', color: 'white', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #444' }}>
        nodes in store: {nodeCount}
      </div>
      <Canvas />
    </>
  )
}
