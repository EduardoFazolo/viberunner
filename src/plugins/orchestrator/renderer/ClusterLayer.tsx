/**
 * ClusterLayer — renders behind all nodes inside the CanvasOverlay.
 * For each orchestrator node, draws:
 *   1. A subtle rounded bounding box around the orchestrator + its sub-agents
 *   2. Animated wires connecting the orchestrator to each sub-agent
 */
import React from 'react'
import { useNodeStore, NodeData } from '../../../renderer/src/stores/nodeStore'

const TITLE_H = 32
const PAD = 32 // padding around the cluster boundary
const BORDER_R = 16 // border radius

interface Cluster {
  orchestrator: NodeData
  subagents: NodeData[]
}

export function ClusterLayer(): React.ReactElement | null {
  const nodes = useNodeStore((s) => s.nodes)

  // Build clusters: orchestrator → its child nodes (subagents + launched Claude nodes)
  const clusters: Cluster[] = []
  for (const node of nodes.values()) {
    if (node.type !== 'orchestrator') continue
    const subagentIds = (node.props?.subagentIds as string[] | undefined) ?? []
    if (subagentIds.length === 0) continue
    const subagents: NodeData[] = []
    for (const id of subagentIds) {
      const sub = nodes.get(id)
      if (sub) subagents.push(sub)
    }
    if (subagents.length > 0) {
      clusters.push({ orchestrator: node, subagents })
    }
  }

  if (clusters.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <style>{`
          @keyframes orch-wire-flow {
            from { stroke-dashoffset: 20; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes orch-wire-pulse {
            0%, 100% { opacity: 0.08; }
            50%       { opacity: 0.18; }
          }
          @keyframes orch-boundary-pulse {
            0%, 100% { opacity: 0.35; }
            50%       { opacity: 0.55; }
          }
        `}</style>
      </defs>

      {clusters.map(({ orchestrator, subagents }) => {
        const allNodes = [orchestrator, ...subagents]
        const status = (orchestrator.props?.status as string) ?? 'idle'
        const isActive = status === 'thinking' || status === 'streaming' || status === 'spawning' || status === 'parsing'
        const isDone = status === 'done'
        const isError = status === 'error'

        // Compute bounding box in world coords
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const n of allNodes) {
          const h = n.minimized ? TITLE_H : n.height
          if (n.x < minX) minX = n.x
          if (n.y < minY) minY = n.y
          if (n.x + n.width > maxX) maxX = n.x + n.width
          if (n.y + h > maxY) maxY = n.y + h
        }

        const bx = minX - PAD
        const by = minY - PAD
        const bw = maxX - minX + PAD * 2
        const bh = maxY - minY + PAD * 2

        // Colors
        const accentColor = isError ? '#f87171' : isDone ? '#4ade80' : '#a78bfa'
        const boundaryOpacity = isActive ? 0.55 : isDone ? 0.3 : isError ? 0.35 : 0.25
        const gradId = `orch-cluster-${orchestrator.id}`

        // Orchestrator anchor: right-center
        const ox = orchestrator.x + orchestrator.width
        const oy = orchestrator.y + (orchestrator.minimized ? TITLE_H / 2 : orchestrator.height / 2)

        return (
          <g key={orchestrator.id}>
            {/* Cluster boundary background */}
            <rect
              x={bx} y={by}
              width={bw} height={bh}
              rx={BORDER_R} ry={BORDER_R}
              fill={accentColor}
              fillOpacity={0.02}
              stroke={accentColor}
              strokeWidth={1.5}
              strokeOpacity={boundaryOpacity}
              strokeDasharray={isActive ? '6 4' : 'none'}
              style={isActive ? { animation: 'orch-boundary-pulse 2s ease-in-out infinite' } : undefined}
            />

            {/* Corner label */}
            <text
              x={bx + 10} y={by + 14}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
              fontWeight={600}
              fill={accentColor}
              opacity={0.4}
              letterSpacing="0.06em"
            >
              CLUSTER
            </text>

            {/* Wires from orchestrator to each subagent */}
            {subagents.map((sub) => {
              // Subagent anchor: left-center
              const sx = sub.x
              const sy = sub.y + (sub.minimized ? TITLE_H / 2 : sub.height / 2)

              // Horizontal bezier
              const span = Math.abs(sx - ox)
              const pull = Math.max(span * 0.4, 50)
              const cx1 = ox + pull
              const cx2 = sx - pull
              const d = `M ${ox} ${oy} C ${cx1} ${oy} ${cx2} ${sy} ${sx} ${sy}`
              const wireGradId = `${gradId}-wire-${sub.id}`

              return (
                <g key={sub.id}>
                  <defs>
                    <linearGradient
                      id={wireGradId}
                      x1={ox} y1={oy}
                      x2={sx} y2={sy}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>

                  {/* Soft glow */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={6}
                    fill="none"
                    style={{ animation: 'orch-wire-pulse 2.4s ease-in-out infinite' }}
                  />

                  {/* Solid baseline */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={1}
                    fill="none"
                    opacity={0.2}
                  />

                  {/* Flowing dashes */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={1.5}
                    fill="none"
                    strokeDasharray="4 16"
                    opacity={0.8}
                    style={{ animation: 'orch-wire-flow 1s linear infinite' }}
                  />

                  {/* Source dot (orchestrator / purple) */}
                  <circle cx={ox} cy={oy} r={3} fill="#a78bfa" opacity={0.6} />
                  <circle cx={ox} cy={oy} r={5} fill="none" stroke="#a78bfa" strokeWidth={0.8} opacity={0.2} />

                  {/* Target dot (subagent / indigo) */}
                  <circle cx={sx} cy={sy} r={3} fill="#818cf8" opacity={0.6} />
                  <circle cx={sx} cy={sy} r={5} fill="none" stroke="#818cf8" strokeWidth={0.8} opacity={0.2} />
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
