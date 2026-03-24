import { MCP_TOOLS } from './tools'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedAction {
  tool: string
  args: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Plan parser — extracts a list of actions from the LLM's JSON response
// ---------------------------------------------------------------------------

export function parsePlan(raw: string): PlannedAction[] {
  // Strip markdown fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }

  const parsed = JSON.parse(cleaned)

  if (!Array.isArray(parsed)) {
    throw new Error('Plan must be a JSON array')
  }

  const validTools = new Set(MCP_TOOLS.map((t) => t.name))
  const actions: PlannedAction[] = []

  for (const item of parsed) {
    if (!item.tool || typeof item.tool !== 'string') {
      throw new Error(`Invalid action: missing tool name`)
    }
    if (!validTools.has(item.tool)) {
      throw new Error(`Unknown tool: ${item.tool}`)
    }
    actions.push({
      tool: item.tool,
      args: item.args ?? {},
    })
  }

  return actions
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function summarizeAction(action: PlannedAction): string {
  const { tool, args } = action
  switch (tool) {
    case 'openNode': return `openNode: ${args.type}`
    case 'focusNode': return `focusNode: ${args.id}`
    case 'removeNode': return `removeNode: ${args.id}`
    case 'switchWorkspace': return `switchWorkspace: ${args.id}`
    case 'arrangeNodes': return `arrangeNodes: ${args.strategy}`
    case 'setCamera': return `setCamera: zoom ${args.zoom}`
    default: return tool
  }
}
