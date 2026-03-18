import React from 'react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useVisibleNodes } from '../hooks/useVisibleNodes'
import { TerminalNode } from './TerminalNode'
import { BrowserNode } from './BrowserNode'
import { FilesNode } from './FilesNode'
import { NoteNode } from './NoteNode'
import { pluginRegistry } from '../../../plugins/types'

export function NodeLayer(): React.ReactElement {
  const nodes = useNodeStore((s) => s.nodes)
  const camera = useCameraStore((s) => s.camera)
  const visible = useVisibleNodes(nodes, camera)

  return (
    <>
      {visible.map((node) => {
        if (node.type === 'terminal') return <TerminalNode key={node.id} node={node} />
        if (node.type === 'browser') return <BrowserNode key={node.id} node={node} />
        if (node.type === 'files') return <FilesNode key={node.id} node={node} />
        if (node.type === 'note') return <NoteNode key={node.id} node={node} />

        // Plugin-registered node types
        const plugin = pluginRegistry.get(node.type)
        if (plugin) return <plugin.component key={node.id} node={node} />

        return null
      })}
    </>
  )
}
