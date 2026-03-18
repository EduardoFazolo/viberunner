import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { TerminalNode } from '../../../renderer/src/components/TerminalNode'

interface Props {
  node: NodeData
}

/**
 * Claude plugin node.
 *
 * Renders a TerminalNode with `shell: 'claude'` injected into props.
 * The cwd is set at creation time (workspace path) and persisted normally.
 */
export function ClaudeNode({ node }: Props): React.ReactElement {
  const claudeNode: NodeData = {
    ...node,
    props: {
      ...node.props,
      shell: 'claude',
    },
  }
  return <TerminalNode node={claudeNode} />
}
