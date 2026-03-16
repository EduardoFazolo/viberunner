import React from 'react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useVisibleNodes } from '../hooks/useVisibleNodes'
import { TerminalNode } from './TerminalNode'

export function NodeLayer(): React.ReactElement {
  const nodes = useNodeStore((s) => s.nodes)
  const camera = useCameraStore((s) => s.camera)
  const visible = useVisibleNodes(nodes, camera)

  console.log('[NodeLayer] visible nodes:', visible.length, 'total:', nodes.size)

  return (
    <>
      {visible.map((node) => {
        if (node.type === 'terminal') return <TerminalNode key={node.id} node={node} />
        return null
      })}
    </>
  )
}
