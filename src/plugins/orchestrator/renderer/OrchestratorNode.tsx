import React from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'

interface OrchestratorProps {
  task: string
  status: 'idle' | 'thinking' | 'done' | 'error'
  message?: string
  subagentIds: string[]
}

interface Props {
  node: NodeData
}

const STATUS_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  done: '#4ade80',
  error: '#f87171',
  idle: 'rgba(255,255,255,0.2)',
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Thinking…',
  done: 'Done',
  error: 'Error',
  idle: 'Ready',
}

export function OrchestratorNode({ node }: Props): React.ReactElement {
  const props = node.props as Partial<OrchestratorProps>
  const status = props.status ?? 'idle'
  const task = props.task ?? ''
  const message = props.message ?? STATUS_LABELS[status]
  const subagentIds = props.subagentIds ?? []
  const statusColor = STATUS_COLORS[status]

  const titleExtra = (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: statusColor,
      boxShadow: status !== 'idle' ? `0 0 5px ${statusColor}` : undefined,
      flexShrink: 0,
      animation: status === 'thinking' ? 'orch-pulse 1.4s ease-in-out infinite' : undefined,
    }} />
  )

  return (
    <BaseNode node={node} titleExtra={titleExtra}>
      <div style={{
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
        height: '100%', overflow: 'auto', boxSizing: 'border-box',
      }}>
        {/* Task */}
        <div>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
          }}>
            Task
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.45,
          }}>
            {task}
          </div>
        </div>

        {/* Status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
            boxShadow: status !== 'idle' ? `0 0 4px ${statusColor}` : undefined,
          }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {message}
          </span>
        </div>

        {/* Sub-agents */}
        {subagentIds.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              Sub-agents ({subagentIds.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {subagentIds.map((id) => (
                <SubagentRef key={id} nodeId={id} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes orch-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </BaseNode>
  )
}

function SubagentRef({ nodeId }: { nodeId: string }): React.ReactElement {
  const node = useNodeStore((s) => s.nodes.get(nodeId))
  if (!node) return <></>

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 5,
      border: '1px solid rgba(255,255,255,0.06)',
      fontSize: 12, color: 'rgba(255,255,255,0.6)',
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'rgba(52,211,153,0.7)', flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </span>
    </div>
  )
}
