import Anthropic from '@anthropic-ai/sdk'
import type { WebContents } from 'electron'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
} from '../shared/types'

const ORCHESTRATOR_W = 520
const SUBAGENT_H = 180
const SUBAGENT_GAP = 50

const SYSTEM_PROMPT = `You are an AI task orchestrator embedded in a spatial canvas application called CanvaFlow.

Your job is to analyze the given task and break it down into 2-6 focused, parallel sub-tasks that can be delegated to specialized sub-agents.

For each sub-task, call spawn_subagent with:
- A short title (max 30 chars), e.g. "API Routes", "Database Schema", "Unit Tests"
- A 1-3 sentence task description explaining exactly what the sub-agent should do

After spawning all agents, call complete with a one-sentence summary.

Rules:
- Prefer 2-4 focused agents over many small ones
- Make sub-tasks as independent as possible
- Be concrete about what each agent should produce`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'spawn_subagent',
    description: 'Spawn a sub-agent node on the canvas for a specific sub-task.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short agent title (max 30 chars), e.g. "API Routes"',
        },
        task: {
          type: 'string',
          description: 'Detailed task description (1-3 sentences)',
        },
      },
      required: ['title', 'task'],
    },
  },
  {
    name: 'complete',
    description: 'Mark orchestration complete after all agents have been spawned.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One sentence summary of the decomposition',
        },
      },
      required: ['summary'],
    },
  },
]

// Active runs — keyed by orchestratorId, value is an AbortController
const activeRuns = new Map<string, AbortController>()

export function runOrchestrator(
  payload: OrchestratorStartPayload,
  orchestratorId: string,
  webContents: WebContents,
): void {
  const controller = new AbortController()
  activeRuns.set(orchestratorId, controller)
  void _run(payload, orchestratorId, webContents, controller.signal).finally(() => {
    activeRuns.delete(orchestratorId)
  })
}

export function cancelOrchestrator(orchestratorId: string): void {
  activeRuns.get(orchestratorId)?.abort()
  activeRuns.delete(orchestratorId)
}

async function _run(
  payload: OrchestratorStartPayload,
  orchestratorId: string,
  webContents: WebContents,
  signal: AbortSignal,
): Promise<void> {
  const send = <T>(channel: string, data: T): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, data)
  }

  const sendStatus = (status: OrchestratorStatusEvent['status'], message?: string): void => {
    send<OrchestratorStatusEvent>('orchestrator:status', { orchestratorId, status, message })
  }

  let agentIndex = 0
  let finished = false

  try {
    const client = new Anthropic({ apiKey: payload.apiKey })

    const userContent = [
      `**Task:** ${payload.task}`,
      payload.markdown ? `\n**Details:**\n${payload.markdown}` : '',
    ].join('')

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userContent.trim() },
    ]

    sendStatus('thinking', 'Analyzing task…')

    // Agentic loop — typically resolves in 1 turn
    while (!finished) {
      if (signal.aborted) return

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
        tools: TOOLS,
      })

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'spawn_subagent') {
          const input = block.input as { title: string; task: string }
          const idx = agentIndex++
          const subagentX = payload.worldX + ORCHESTRATOR_W + 80
          const subagentY = payload.worldY + idx * (SUBAGENT_H + SUBAGENT_GAP)

          send<SubagentSpawnedEvent>('orchestrator:node-created', {
            orchestratorId,
            agentId: `subagent-${orchestratorId}-${idx}`,
            title: input.title.slice(0, 40),
            task: input.task,
            worldX: subagentX,
            worldY: subagentY,
          })

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Spawned successfully.',
          })
        } else if (block.name === 'complete') {
          const input = block.input as { summary: string }
          finished = true
          sendStatus('done', input.summary)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Done.',
          })
        }
      }

      if (response.stop_reason === 'end_turn') {
        if (!finished) sendStatus('done', `Spawned ${agentIndex} agent${agentIndex !== 1 ? 's' : ''}.`)
        break
      }

      if (toolResults.length > 0 && !finished) {
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })
      } else {
        break
      }
    }
  } catch (err) {
    if (signal.aborted) return
    const msg = err instanceof Error ? err.message : String(err)
    sendStatus('error', msg)
  }
}
