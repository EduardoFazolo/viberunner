import React, { useCallback } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'

interface SubagentProps {
  task: string
  note?: string
  orchestratorId?: string
  workspacePath?: string
}

interface Props {
  node: NodeData
}

/**
 * Build a coordination preamble for the agent's task.
 * This tells Claude it's part of a cluster and to avoid stepping on other agents' files.
 */
function buildClusterPreamble(
  myTask: string,
  myTitle: string,
  orchestratorNode: NodeData | undefined,
): string {
  if (!orchestratorNode) return myTask

  const mainTask = (orchestratorNode.props.task as string) ?? ''
  const subagentIds = (orchestratorNode.props.subagentIds as string[] | undefined) ?? []
  const store = useNodeStore.getState()

  const siblingTasks: string[] = []
  for (const id of subagentIds) {
    const node = store.nodes.get(id)
    if (!node) continue
    const nodeTask = (node.props?.task as string) ?? ''
    const nodeTitle = node.title ?? ''
    // Include all siblings (including self) for full picture
    siblingTasks.push(`- "${nodeTitle}": ${nodeTask}`)
  }

  const preamble = [
    `IMPORTANT — You are part of a multi-agent cluster working on: "${mainTask}"`,
    ``,
    `Your specific task: ${myTask}`,
    ``,
    `Other agents are working IN PARALLEL on these tasks:`,
    ...siblingTasks,
    ``,
    `COORDINATION RULES:`,
    `1. ONLY modify files directly related to YOUR task. Do not touch files that other agents are likely editing.`,
    `2. If you need to modify a shared file (like a router, index, or config), make MINIMAL changes — add only what you need, do not reorganize or refactor.`,
    `3. Before editing any file, consider whether another agent might also be editing it. If yes, keep your changes as small and isolated as possible.`,
    `4. Prefer ADDING new files over modifying existing shared ones when possible.`,
    `5. When done, provide a brief summary of which files you created or modified.`,
  ].join('\n')

  return preamble
}

export function SubagentNode({ node }: Props): React.ReactElement {
  const { add, remove, update } = useNodeStore()
  const props = node.props as Partial<SubagentProps>
  const task = props.task ?? ''
  const note = props.note
  const orchestratorId = props.orchestratorId

  const handleLaunchClaude = useCallback(() => {
    // Create a Claude node at the same position as this subagent
    // Launch with bypassPermissions so orchestrated agents run autonomously
    const newNode = add('claude', node.x, node.y, {
      cwd: props.workspacePath ?? '',
      claudeFlags: '--dangerously-skip-permissions',
    })

    // If we belong to an orchestrator, swap our ID in its subagentIds list
    if (orchestratorId) {
      const store = useNodeStore.getState()
      const orchNode = store.nodes.get(orchestratorId)
      if (orchNode) {
        const subagentIds = (orchNode.props.subagentIds as string[] | undefined) ?? []
        const updated = subagentIds.map((id) => (id === node.id ? newNode.id : id))
        store.update(orchestratorId, {
          props: {
            ...orchNode.props,
            subagentIds: updated,
          },
        })
      }

      // Register this Claude node in the signal server's cluster tracking
      window.orchestrator.registerNode(newNode.id, orchestratorId)
    }

    // Copy the orchestratorId + task to the new Claude node
    update(newNode.id, {
      props: {
        ...newNode.props,
        orchestratorId,
        task,
        cwd: props.workspacePath ?? '',
      },
    })

    // Build the full prompt with coordination preamble
    const orchNode = orchestratorId
      ? useNodeStore.getState().nodes.get(orchestratorId)
      : undefined
    const fullPrompt = buildClusterPreamble(task, node.title, orchNode)

    // Activate the terminal immediately so it starts without needing a click
    useActivationStore.getState().activate(newNode.id)

    // Remove the subagent note node
    remove(node.id)

    // Wait for the terminal to be ready by listening for output, then send the task.
    // Send the text and Enter separately to avoid bracketed paste mode swallowing the newline.
    let sent = false
    const sendTask = () => {
      if (sent) return
      sent = true
      // Write the prompt text (will be bracketed-pasted by the terminal)
      window.terminal.write(newNode.id, fullPrompt)
      // Send Enter as a separate write after a brief gap — outside the paste bracket
      setTimeout(() => {
        window.terminal.write(newNode.id, '\r')
      }, 100)
    }

    const unsub = window.terminal.onData(newNode.id, () => {
      unsub()
      setTimeout(sendTask, 300)
    })

    // Safety fallback
    setTimeout(() => {
      unsub()
      sendTask()
    }, 5000)
  }, [node.id, node.x, node.y, node.title, task, orchestratorId, props.workspacePath, add, remove, update])

  return (
    <BaseNode node={node}>
      <div style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Task description */}
        <div style={{
          flex: 1, padding: '12px 14px',
          overflow: 'auto',
          fontSize: 12, color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.55,
        }}>
          {task}
        </div>

        {/* Live note (updated by orchestrator) */}
        {note && (
          <div style={{
            margin: '0 10px 8px',
            padding: '7px 10px',
            background: 'rgba(167,139,250,0.07)',
            borderRadius: 6,
            border: '1px solid rgba(167,139,250,0.15)',
            fontSize: 11, color: 'rgba(167,139,250,0.8)',
            lineHeight: 1.5,
          }}>
            {note}
          </div>
        )}

        {/* Launch Claude button */}
        <div style={{ padding: '0 10px 10px' }}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleLaunchClaude}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 6,
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.25)',
              color: 'rgba(167,139,250,0.85)',
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
              background: 'rgba(167,139,250,0.18)',
              borderColor: 'rgba(167,139,250,0.45)',
            })}
            onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
              background: 'rgba(167,139,250,0.1)',
              borderColor: 'rgba(167,139,250,0.25)',
            })}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
            </svg>
            Launch Claude
          </button>
        </div>
      </div>
    </BaseNode>
  )
}
