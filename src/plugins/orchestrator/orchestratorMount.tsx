/**
 * OrchestratorMount — mounts once on the canvas and wires up IPC events
 * from the main-process orchestrator runner into the node store.
 */
import React, { useEffect } from 'react'
import { useNodeStore } from '../../renderer/src/stores/nodeStore'
import type { SubagentSpawnedEvent, OrchestratorStatusEvent, NoteUpdateEvent } from './shared/types'
import type { AgentFileChange } from '../../modules/servers/agentic_signals/shared/types'

interface FileChangeEntry {
  nodeId: string
  agentName: string
  filePath: string
  toolName: string
  timestamp: number
}

export function OrchestratorMount(): React.ReactElement | null {
  useEffect(() => {
    const unsubNodes = window.orchestrator.onNodeCreated((event: SubagentSpawnedEvent) => {
      const store = useNodeStore.getState()

      // Create the SubagentNode
      const subagent = store.add('subagent', event.worldX, event.worldY, {
        task: event.task,
        orchestratorId: event.orchestratorId,
        workspacePath: event.workspacePath,
        note: undefined,
      })
      store.update(subagent.id, {
        title: event.title,
        props: { ...subagent.props, agentId: event.agentId },
      })

      // Add this subagent's id to the orchestrator node's subagentIds list
      const orchestratorNode = store.nodes.get(event.orchestratorId)
      if (orchestratorNode) {
        const existing = (orchestratorNode.props.subagentIds as string[] | undefined) ?? []
        store.update(event.orchestratorId, {
          props: {
            ...orchestratorNode.props,
            subagentIds: [...existing, subagent.id],
          },
        })
      }
    })

    const unsubStatus = window.orchestrator.onStatus((event: OrchestratorStatusEvent) => {
      const store = useNodeStore.getState()
      const node = store.nodes.get(event.orchestratorId)
      if (!node) return
      store.update(event.orchestratorId, {
        props: {
          ...node.props,
          status: event.status,
          message: event.message,
          ...(event.streamText !== undefined ? { streamText: event.streamText } : {}),
        },
      })
    })

    const unsubNotes = window.orchestrator.onNoteUpdate((event: NoteUpdateEvent) => {
      const store = useNodeStore.getState()
      for (const node of store.nodes.values()) {
        if (node.type === 'subagent' && (node.props as any).agentId === event.agentId) {
          store.update(node.id, { props: { ...node.props, note: event.note } })
          break
        }
      }
    })

    // Listen for file change events from agents in clusters
    const unsubFileChanges = window.agent.onFileChange((event: AgentFileChange & { orchestratorId: string }) => {
      const store = useNodeStore.getState()
      const orchNode = store.nodes.get(event.orchestratorId)
      if (!orchNode) return

      const existing = (orchNode.props.fileChanges as FileChangeEntry[] | undefined) ?? []
      const agentNode = store.nodes.get(event.nodeId)
      const agentName = agentNode?.title ?? event.nodeId.slice(0, 8)

      // Deduplicate — only add if this file+agent combo isn't already logged
      const key = `${event.nodeId}:${event.filePath}`
      if (existing.some((e) => `${e.nodeId}:${e.filePath}` === key)) return

      const entry: FileChangeEntry = {
        nodeId: event.nodeId,
        agentName,
        filePath: event.filePath,
        toolName: event.toolName,
        timestamp: Date.now(),
      }

      store.update(event.orchestratorId, {
        props: {
          ...orchNode.props,
          fileChanges: [...existing, entry],
        },
      })
    })

    return () => {
      unsubNodes()
      unsubStatus()
      unsubNotes()
      unsubFileChanges()
    }
  }, [])

  return null
}
