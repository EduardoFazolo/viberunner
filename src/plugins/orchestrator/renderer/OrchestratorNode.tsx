import React, { useRef, useEffect } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'

interface FileChangeEntry {
  nodeId: string
  agentName: string
  filePath: string
  toolName: string
  timestamp: number
}

interface OrchestratorProps {
  task: string
  status: 'idle' | 'thinking' | 'streaming' | 'parsing' | 'spawning' | 'done' | 'error'
  message?: string
  streamText?: string
  subagentIds: string[]
  fileChanges?: FileChangeEntry[]
}

interface Props {
  node: NodeData
}

const STATUS_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  streaming: '#a78bfa',
  parsing: '#818cf8',
  spawning: '#60a5fa',
  done: '#4ade80',
  error: '#f87171',
  idle: 'rgba(255,255,255,0.2)',
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Thinking…',
  streaming: 'Responding…',
  parsing: 'Parsing…',
  spawning: 'Spawning agents…',
  done: 'Done',
  error: 'Error',
  idle: 'Ready',
}

const isActive = (s: string): boolean =>
  s === 'thinking' || s === 'streaming' || s === 'parsing' || s === 'spawning'

export function OrchestratorNode({ node }: Props): React.ReactElement {
  const props = node.props as Partial<OrchestratorProps>
  const status = props.status ?? 'idle'
  const task = props.task ?? ''
  const message = props.message ?? STATUS_LABELS[status]
  const streamText = props.streamText ?? ''
  const subagentIds = props.subagentIds ?? []
  const fileChanges = props.fileChanges ?? []
  const statusColor = STATUS_COLORS[status]
  const streamRef = useRef<HTMLDivElement>(null)
  const changesRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the stream view
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [streamText])

  // Auto-scroll the changes log
  useEffect(() => {
    if (changesRef.current) {
      changesRef.current.scrollTop = changesRef.current.scrollHeight
    }
  }, [fileChanges.length])

  const titleExtra = (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: statusColor,
      boxShadow: status !== 'idle' ? `0 0 5px ${statusColor}` : undefined,
      flexShrink: 0,
      animation: isActive(status) ? 'orch-pulse 1.4s ease-in-out infinite' : undefined,
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
            animation: isActive(status) ? 'orch-pulse 1.4s ease-in-out infinite' : undefined,
          }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {message}
          </span>
        </div>

        {/* Stream output — live view of what Claude is responding */}
        {streamText && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
            }}>
              Response
            </div>
            <div
              ref={streamRef}
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.5,
                padding: '8px 10px',
                background: 'rgba(167,139,250,0.06)',
                borderRadius: 6,
                border: '1px solid rgba(167,139,250,0.12)',
                maxHeight: 160,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {streamText}
            </div>
          </div>
        )}

        {/* Error details — show full message for errors */}
        {status === 'error' && message && message.length > 60 && (
          <div style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'rgba(248,113,113,0.8)',
            lineHeight: 1.4,
            padding: '8px 10px',
            background: 'rgba(248,113,113,0.06)',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.12)',
            maxHeight: 120,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {message}
          </div>
        )}

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

        {/* File change activity log */}
        {fileChanges.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              File Changes ({fileChanges.length})
            </div>
            <div
              ref={changesRef}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                maxHeight: 140, overflow: 'auto',
              }}
            >
              {fileChanges.map((change, i) => {
                const shortPath = change.filePath.split('/').slice(-2).join('/')
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    <span style={{
                      color: change.toolName === 'Write' ? 'rgba(74,222,128,0.7)' : 'rgba(251,191,36,0.7)',
                      fontSize: 10, fontWeight: 600, flexShrink: 0, width: 12,
                    }}>
                      {change.toolName === 'Write' ? '+' : '~'}
                    </span>
                    <span style={{
                      color: 'rgba(167,139,250,0.6)',
                      flexShrink: 0,
                      fontSize: 10,
                    }}>
                      {change.agentName}
                    </span>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {shortPath}
                    </span>
                  </div>
                )
              })}
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
