import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { MCP_TOOLS } from './tools'
import { executeTool } from './handlers'
import { parsePlan, summarizeAction } from './planner'
import type { PlannedAction } from './planner'
import type { WebContents } from 'electron'

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

let _cachedPrompt: { text: string; ts: number } | null = null
const CACHE_TTL = 5_000

// Only action tools — read tools are pre-loaded in the system prompt
const READ_TOOLS = new Set(['listNodes', 'listWorkspaces', 'getCamera'])
const ACTION_TOOLS = MCP_TOOLS.filter((t) => !READ_TOOLS.has(t.name))

function buildToolReference(): string {
  return ACTION_TOOLS.map((t) => {
    const params = Object.entries(t.input_schema.properties)
      .map(([k, v]) => `${k}: ${(v as any).type}${(v as any).enum ? ` (${(v as any).enum.join('|')})` : ''}`)
      .join(', ')
    return `- ${t.name}(${params}) — ${t.description.split('.')[0]}`
  }).join('\n')
}

async function buildSystemPrompt(): Promise<string> {
  if (_cachedPrompt && Date.now() - _cachedPrompt.ts < CACHE_TTL) {
    return _cachedPrompt.text
  }

  const workspacesResult = await executeTool('listWorkspaces', {}) as { workspaces: any[]; activeWorkspaceId: string | null }
  const nodesResult = await executeTool('listNodes', {}) as { nodes: any[] }
  const cameraResult = await executeTool('getCamera', {}) as { x: number; y: number; zoom: number }

  const nodes = nodesResult.nodes.map((n: any) => ({
    id: n.id, type: n.type, title: n.title,
    ...(n.pinned ? { pinned: true } : {}),
    ...(n.description ? { description: n.description } : {}),
  }))

  const workspaces = workspacesResult.workspaces.map((w: any) => ({
    id: w.id, name: w.name,
    ...(w.description ? { description: w.description } : {}),
  }))

  const text = `You are a voice command parser for CanvaFlow, a canvas workspace app.

Given a voice command, return a JSON array of actions to execute IN ORDER.
Each action: {"tool": "<tool_name>", "args": {<arguments>}}

RESPOND WITH ONLY THE JSON ARRAY. No text, no markdown, no explanation.

AVAILABLE TOOLS:
${buildToolReference()}

RULES:
- Break complex commands into sequential steps. Order matters.
- "show me X from workspace Y" → [switchWorkspace(Y), focusNode(X)]
- "open a terminal and organize" → [openNode(terminal), arrangeNodes(grid)]
- "show all" / "show me everything" → [fitAll()]
- "focus X" / "go to X" / "show me X" → [focusNode(id)] — match by title/type
- Single commands still return an array: [{"tool":"fitAll","args":{}}]
- If unsure, return [{"tool":"fitAll","args":{}}]

STATE:
activeWorkspace: ${workspacesResult.activeWorkspaceId}
workspaces: ${JSON.stringify(workspaces)}
nodes: ${JSON.stringify(nodes)}
camera: zoom=${cameraResult.zoom?.toFixed(2) ?? 1}`

  _cachedPrompt = { text, ts: Date.now() }
  return text
}

// parsePlan and summarizeAction imported from ./planner

// ---------------------------------------------------------------------------
// Run agent — plan then execute
// ---------------------------------------------------------------------------

export async function runVoiceAgent(
  transcript: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string | null> {
  if (!apiKey) {
    sendStatus({ state: 'error', message: 'No API key. Set it in Settings → Voice Commands.' })
    return null
  }

  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  sendStatus({ state: 'thinking' })

  try {
    // Step 1: Plan — one LLM call to get all actions
    const systemPrompt = await buildSystemPrompt()

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ]

    const response = await client.chat.completions.create({
      model,
      max_tokens: 256,
      messages,
    })

    const rawPlan = response.choices[0]?.message?.content
    if (!rawPlan) {
      sendStatus({ state: 'error', message: 'No response from model' })
      return null
    }

    console.log('[voice-agent] Plan:', rawPlan)

    // Step 2: Parse the plan
    let actions: PlannedAction[]
    try {
      actions = parsePlan(rawPlan)
    } catch (err: any) {
      console.error('[voice-agent] Failed to parse plan:', err.message)
      sendStatus({ state: 'error', message: `Bad plan: ${err.message}` })
      return null
    }

    if (actions.length === 0) {
      sendStatus({ state: 'done' })
      return null
    }

    // Step 3: Execute actions sequentially
    const summary = actions.map(summarizeAction).join(' → ')
    sendStatus({ state: 'executing', message: summary })

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      sendStatus({ state: 'executing', message: `[${i + 1}/${actions.length}] ${summarizeAction(action)}` })

      try {
        await executeTool(action.tool, action.args)
      } catch (err: any) {
        console.error(`[voice-agent] ${action.tool} failed:`, err.message)
        // Continue with remaining actions — don't abort the pipeline
      }

      // Small delay between actions for visual feedback
      if (i < actions.length - 1) {
        await new Promise((r) => setTimeout(r, 150))
      }
    }

    sendStatus({ state: 'done', message: summary })
    return summary
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
