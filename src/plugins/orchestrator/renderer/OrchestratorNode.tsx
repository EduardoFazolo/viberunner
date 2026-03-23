import React, { useState, useCallback } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'

interface OrchestratorProps {
  task: string
  status: 'idle' | 'thinking' | 'done' | 'error'
  message?: string
  subagentIds: string[]
  apiKey?: string
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

function ApiKeySetup({ onSave }: { onSave: (key: string) => void }): React.ReactElement {
  const [draft, setDraft] = useState('')

  return (
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
        Enter your Anthropic API key to enable orchestration.
      </div>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && draft.trim()) onSave(draft.trim())
        }}
        placeholder="sk-ant-..."
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '7px 10px',
          color: 'rgba(255,255,255,0.85)', fontSize: 12,
          fontFamily: 'monospace', outline: 'none',
        }}
      />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => { if (draft.trim()) onSave(draft.trim()) }}
        disabled={!draft.trim()}
        style={{
          padding: '7px 14px', borderRadius: 6,
          background: draft.trim() ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${draft.trim() ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
          color: draft.trim() ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.25)',
          fontSize: 12, fontWeight: 500, cursor: draft.trim() ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        Save API Key
      </button>
    </div>
  )
}

export function OrchestratorNode({ node }: Props): React.ReactElement {
  const { update } = useNodeStore()
  const props = node.props as Partial<OrchestratorProps>
  const status = props.status ?? 'idle'
  const task = props.task ?? ''
  const message = props.message ?? STATUS_LABELS[status]
  const subagentIds = props.subagentIds ?? []
  const apiKey = props.apiKey

  const handleSaveKey = useCallback((key: string) => {
    void window.appState.set('orchestrator-api-key', key)
    update(node.id, { props: { ...node.props, apiKey: key } })
  }, [node.id, node.props, update])

  const statusColor = STATUS_COLORS[status]

  const titleExtra = (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: statusColor,
      boxShadow: status === 'thinking' ? `0 0 6px ${statusColor}` : undefined,
      flexShrink: 0,
      animation: status === 'thinking' ? 'pulse 1.5s ease-in-out infinite' : undefined,
    }} />
  )

  if (!apiKey) {
    return (
      <BaseNode node={node}>
        <ApiKeySetup onSave={handleSaveKey} />
      </BaseNode>
    )
  }

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
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
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
        background: 'rgba(167,139,250,0.7)', flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </span>
    </div>
  )
}
