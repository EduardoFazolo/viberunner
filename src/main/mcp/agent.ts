import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { MCP_TOOLS } from './tools'
import { executeTool } from './handlers'
import { getAppState } from '../database'
import type { WebContents } from 'electron'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentStatus {
  state: 'thinking' | 'executing' | 'done' | 'error'
  message?: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _getWebContents: (() => WebContents | null) | null = null

function sendStatus(status: AgentStatus): void {
  _getWebContents?.()?.send('voice:agentStatus', status)
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

async function buildSystemPrompt(): Promise<string> {
  const workspacesResult = await executeTool('listWorkspaces', {})
  const nodesResult = await executeTool('listNodes', {})
  const cameraResult = await executeTool('getCamera', {})

  const ws = workspacesResult as { workspaces: unknown[]; activeWorkspaceId: string | null }
  const nd = nodesResult as { nodes: unknown[] }

  return `You are a voice assistant controlling a canvas-based workspace app called CanvaFlow.
The user speaks a natural-language command and you respond by calling the appropriate tools.

RULES:
- Be concise. Only respond with text if the user asks a question; otherwise just execute tools silently.
- You can chain multiple tool calls for multi-step commands.
- When the user says "this" or "that", infer from context (most recently focused node, etc).
- For "show me all windows", use fitAll.
- For "organize", use arrangeNodes with an appropriate strategy.
- For navigation ("go to X", "focus X"), match by node title or type.

CURRENT STATE:
Active workspace: ${ws.activeWorkspaceId ?? 'none'}
Workspaces: ${JSON.stringify(ws.workspaces, null, 2)}
Nodes in active workspace: ${JSON.stringify(nd.nodes, null, 2)}
Camera: ${JSON.stringify(cameraResult)}`
}

// ---------------------------------------------------------------------------
// Convert MCP tool defs to OpenAI format
// ---------------------------------------------------------------------------

function toOpenAITools(): ChatCompletionTool[] {
  return MCP_TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeParams(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'openNode': return `${input.type}`
    case 'focusNode': return `${input.id}`
    case 'removeNode': return `${input.id}`
    case 'switchWorkspace': return `${input.id}`
    case 'arrangeNodes': return `${input.strategy}`
    case 'setCamera': return `zoom ${input.zoom}`
    default: return ''
  }
}

// ---------------------------------------------------------------------------
// Run agent
// ---------------------------------------------------------------------------

export async function runVoiceAgent(
  transcript: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string | null> {
  if (!apiKey) {
    sendStatus({ state: 'error', message: 'No API key configured. Set it in Settings → Voice Commands.' })
    return null
  }

  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  sendStatus({ state: 'thinking' })

  try {
    const systemPrompt = await buildSystemPrompt()
    const tools = toOpenAITools()

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ]

    let textResponse: string | null = null

    // Agentic loop — keep going until the model stops calling tools
    for (let turn = 0; turn < 10; turn++) {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        tools,
        messages,
      })

      const choice = response.choices[0]
      if (!choice) break

      const msg = choice.message
      messages.push(msg)

      // Collect text
      if (msg.content) {
        textResponse = msg.content
      }

      // If no tool calls, we're done
      const toolCalls = msg.tool_calls
      if (!toolCalls || toolCalls.length === 0) break

      // Execute tool calls
      for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, unknown> = {}
        try { fnArgs = JSON.parse(toolCall.function.arguments) } catch {}

        const paramSummary = summarizeParams(fnName, fnArgs)
        sendStatus({ state: 'executing', message: `${fnName}${paramSummary ? ': ' + paramSummary : ''}` })

        let resultContent: string
        try {
          const result = await executeTool(fnName, fnArgs)
          resultContent = JSON.stringify(result)
        } catch (err: any) {
          resultContent = JSON.stringify({ error: err.message })
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultContent,
        })
      }

      // If finish reason is "stop", we're done
      if (choice.finish_reason === 'stop') break
    }

    sendStatus({ state: 'done', message: textResponse ?? undefined })
    return textResponse
  } catch (err: any) {
    console.error('[voice-agent] Error:', err.message)
    sendStatus({ state: 'error', message: err.message })
    return null
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initVoiceAgent(getWebContents: () => WebContents | null): void {
  _getWebContents = getWebContents
}
