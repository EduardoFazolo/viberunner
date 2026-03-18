import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import { getPreparedNotionExternalDrag, primeNotionExternalDrag } from '../utils/notionDrag'

export interface NotionDropPayload {
  title: string
  pageId: string
  partition: string
  clientX: number
  clientY: number
}

interface Agent {
  id: string
  label: string
  icon: React.ReactNode
}

const AGENTS: Agent[] = [
  {
    id: 'claude',
    label: 'Claude',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
      </svg>
    ),
  },
]

function titleToBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

interface Props {
  payload: NotionDropPayload
  onClose: () => void
}

export function NotionDropModal({ payload, onClose }: Props): React.ReactElement {
  const { title, pageId, partition, clientX, clientY } = payload

  const [autoBranch, setAutoBranch] = useState(false)
  const branchName = titleToBranchName(title)
  const [branchBlocked, setBranchBlocked] = useState(false)
  const [branchBlockReason, setBranchBlockReason] = useState('')
  const [loading, setLoading] = useState(false)

  const workspace = getActiveWorkspace()

  useEffect(() => {
    const path = workspace?.path
    if (!path) {
      setBranchBlocked(true)
      setBranchBlockReason('No active workspace')
      return
    }
    window.git.isRepo(path).then((isRepo) => {
      if (!isRepo) {
        setBranchBlocked(true)
        setBranchBlockReason('Workspace is not a git repo')
        return
      }
      window.git.status(path).then((s) => {
        if (s.files.length > 0) {
          setBranchBlocked(true)
          setBranchBlockReason('Uncommitted changes present')
        }
      }).catch(() => {
        setBranchBlocked(true)
        setBranchBlockReason('Could not read git status')
      })
    }).catch(() => {
      setBranchBlocked(true)
      setBranchBlockReason('Could not check git repo')
    })
  }, [workspace?.path])

  const handleStartAgent = useCallback(async (agentId: string) => {
    if (agentId !== 'claude') return
    setLoading(true)
    try {
      const cwd = workspace?.path || ''

      if (autoBranch && !branchBlocked && cwd) {
        await window.git.checkoutBranch(cwd, branchName, true)
      }

      let text = title
      const prepared = getPreparedNotionExternalDrag(partition, pageId)
      if (prepared) {
        text = prepared.text
      } else {
        try {
          const result = await primeNotionExternalDrag(partition, pageId, title)
          text = result.text
        } catch {}
      }

      const canvasEl = document.querySelector('[data-canvas-root]')
      const canvasRect = canvasEl?.getBoundingClientRect()
      if (!canvasRect) return

      const camera = useCameraStore.getState().camera
      const wx = (clientX - canvasRect.left - camera.x) / camera.zoom
      const wy = (clientY - canvasRect.top - camera.y) / camera.zoom

      const newNode = useNodeStore.getState().add('claude', wx - 350, wy - 240, { cwd })

      const nodeId = newNode.id
      const capturedText = text
      setTimeout(() => {
        window.terminal.write(nodeId, capturedText + '\n')
      }, 1500)

      onClose()
    } catch (e) {
      console.error('[NotionDropModal]', e)
    } finally {
      setLoading(false)
    }
  }, [autoBranch, branchBlocked, branchName, clientX, clientY, partition, pageId, title, workspace?.path, onClose])

  const canToggleBranch = !branchBlocked

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        zIndex: 1000000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onPointerDown={onClose}
    >
      <div
        style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: 20,
          width: 340,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
          }}>
            Task
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: 'rgba(255,255,255,0.88)',
            lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {title}
          </div>
        </div>

        {/* Branch toggle */}
        <div style={{
          marginBottom: 16,
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
          border: `1px solid ${autoBranch && canToggleBranch ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.07)'}`,
          opacity: branchBlocked ? 0.4 : 1,
          transition: 'border-color 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Toggle switch */}
            <div
              onClick={() => canToggleBranch && setAutoBranch((v) => !v)}
              style={{
                width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                background: autoBranch && canToggleBranch ? '#7c3aed' : 'rgba(255,255,255,0.12)',
                position: 'relative',
                cursor: canToggleBranch ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 2, left: autoBranch && canToggleBranch ? 15 : 2,
                width: 13, height: 13, borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                Checkout new branch
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: branchBlocked
                  ? 'rgba(255,255,255,0.25)'
                  : autoBranch ? 'rgba(167,139,250,0.75)' : 'rgba(255,255,255,0.28)',
                fontFamily: 'monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {branchBlocked ? branchBlockReason : branchName}
              </div>
            </div>
          </div>
        </div>

        {/* Agents */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Start session with
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleStartAgent(agent.id)}
                disabled={loading}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(167,139,250,0.25)',
                  background: 'rgba(167,139,250,0.08)',
                  color: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                  fontSize: 13, fontWeight: 500,
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 9,
                  fontFamily: 'inherit',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    Object.assign((e.currentTarget as HTMLElement).style, {
                      background: 'rgba(167,139,250,0.15)',
                      borderColor: 'rgba(167,139,250,0.45)',
                    })
                  }
                }}
                onMouseLeave={(e) => {
                  Object.assign((e.currentTarget as HTMLElement).style, {
                    background: 'rgba(167,139,250,0.08)',
                    borderColor: 'rgba(167,139,250,0.25)',
                  })
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: 'rgba(167,139,250,0.15)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(167,139,250,0.9)',
                  flexShrink: 0,
                }}>
                  {agent.icon}
                </span>
                {loading ? 'Starting…' : agent.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          style={{
            width: '100%', textAlign: 'center',
            padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.28)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)' }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}
