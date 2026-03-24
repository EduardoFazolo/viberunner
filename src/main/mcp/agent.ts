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

// Cache to avoid rebuilding every call
let _cachedPrompt: { text: string; ts: number } | null = null
const CACHE_TTL = 5_000

async function buildSystemPrompt(): Promise<string> {
  if (_cachedPrompt && Date.now() - _cachedPrompt.ts < CACHE_TTL) {
    return _cachedPrompt.text
  }

  const workspacesResult = await executeTool('listWorkspaces', {}) as { workspaces: any[]; activeWorkspaceId: string | null }
  const nodesResult = await executeTool('listNodes', {}) as { nodes: any[] }
  const cameraResult = await executeTool('getCamera', {}) as { x: number; y: number; zoom: number }

  // Slim node data — agent only needs id, type, title, and key metadata
  const nodes = nodesResult.nodes.map((n: any) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    pinned: n.pinned || undefined,
    description: n.description || undefined,
    focusCount: n.focusCount || undefined,
  }))

  const workspaces = workspacesResult.workspaces.map((w: any) => ({
    id: w.id, name: w.name, description: w.description || undefined,
  }))

  const text = `You control CanvaFlow, a canvas workspace app.

CRITICAL: You MUST respond ONLY with tool calls. NEVER respond with text. NEVER explain what you're doing. NEVER say "I'll do X". Just call the tool. If you cannot fulfill a request, call fitAll as a fallback.

COMMANDS → TOOLS:
- "show all/nodes/windows" → fitAll
- "show/focus/go to X" → focusNode (match by title/type below)
- "open terminal/browser/claude/editor" → openNode
- "organize/arrange" → arrangeNodes
- "close/remove X" → removeNode
- "switch workspace X" → switchWorkspace
- "zoom in/out" → setCamera

STATE:
workspace: ${workspacesResult.activeWorkspaceId}
workspaces: ${JSON.stringify(workspaces)}
nodes: ${JSON.stringify(nodes)}
camera: zoom=${cameraResult.zoom?.toFixed(2) ?? 1}`

  _cachedPrompt = { text, ts: Date.now() }
  return text
}

// ---------------------------------------------------------------------------
// Convert MCP tool defs to OpenAI format
// ---------------------------------------------------------------------------

// Only expose action tools — read tools are pre-loaded in the system prompt
const READ_TOOLS = new Set(['listNodes', 'listWorkspaces', 'getCamera'])

function toOpenAITools(): ChatCompletionTool[] {
  return MCP_TOOLS
    .filter((t) => !READ_TOOLS.has(t.name))
    .map((t) => ({
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
    // Single-shot: call the model once, execute all tools, done.
    // No agentic loop — voice commands should be one action, not a conversation.
    const response = await client.chat.completions.create({
      model,
      max_tokens: 256,
      tools,
      tool_choice: 'required' as const,
      messages,
    })

    const choice = response.choices[0]
    if (choice?.message?.content) {
      textResponse = choice.message.content
    }

    const toolCalls = choice?.message?.tool_calls
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, unknown> = {}
        try { fnArgs = JSON.parse(toolCall.function.arguments) } catch {}

        const paramSummary = summarizeParams(fnName, fnArgs)
        sendStatus({ state: 'executing', message: `${fnName}${paramSummary ? ': ' + paramSummary : ''}` })

        try {
          await executeTool(fnName, fnArgs)
        } catch (err: any) {
          console.error(`[voice-agent] Tool ${fnName} failed:`, err.message)
        }
      }
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
