import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parsePlan, type PlannedAction } from '../main/mcp/planner'
import { MCP_TOOLS } from '../main/mcp/tools'

// ---------------------------------------------------------------------------
// parsePlan — validates JSON plan parsing
// ---------------------------------------------------------------------------

describe('parsePlan', () => {
  it('parses a single action', () => {
    const actions = parsePlan('[{"tool":"fitAll","args":{}}]')
    expect(actions).toEqual([{ tool: 'fitAll', args: {} }])
  })

  it('parses multiple sequential actions', () => {
    const actions = parsePlan(`[
      {"tool":"switchWorkspace","args":{"id":"ws-2"}},
      {"tool":"focusNode","args":{"id":"n1"}}
    ]`)
    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual({ tool: 'switchWorkspace', args: { id: 'ws-2' } })
    expect(actions[1]).toEqual({ tool: 'focusNode', args: { id: 'n1' } })
  })

  it('handles markdown code fences', () => {
    const actions = parsePlan('```json\n[{"tool":"fitAll","args":{}}]\n```')
    expect(actions).toEqual([{ tool: 'fitAll', args: {} }])
  })

  it('handles code fences without json label', () => {
    const actions = parsePlan('```\n[{"tool":"openNode","args":{"type":"terminal"}}]\n```')
    expect(actions).toEqual([{ tool: 'openNode', args: { type: 'terminal' } }])
  })

  it('defaults args to empty object when missing', () => {
    const actions = parsePlan('[{"tool":"fitAll"}]')
    expect(actions).toEqual([{ tool: 'fitAll', args: {} }])
  })

  it('throws on non-array response', () => {
    expect(() => parsePlan('{"tool":"fitAll"}')).toThrow('must be a JSON array')
  })

  it('throws on unknown tool', () => {
    expect(() => parsePlan('[{"tool":"hackTheMainframe","args":{}}]')).toThrow('Unknown tool')
  })

  it('throws on missing tool name', () => {
    expect(() => parsePlan('[{"args":{}}]')).toThrow('missing tool name')
  })

  it('throws on invalid JSON', () => {
    expect(() => parsePlan('not json at all')).toThrow()
  })

  it('throws on empty tool name', () => {
    expect(() => parsePlan('[{"tool":"","args":{}}]')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Plan execution simulation
// ---------------------------------------------------------------------------

async function simulateExecution(actions: PlannedAction[]): Promise<string[]> {
  const executed: string[] = []
  for (const action of actions) {
    executed.push(`${action.tool}(${JSON.stringify(action.args)})`)
  }
  return executed
}

describe('plan execution order', () => {
  it('single action: fitAll', async () => {
    const actions = parsePlan('[{"tool":"fitAll","args":{}}]')
    const executed = await simulateExecution(actions)
    expect(executed).toEqual(['fitAll({})'])
  })

  it('sequential: switchWorkspace → focusNode', async () => {
    const actions = parsePlan(`[
      {"tool":"switchWorkspace","args":{"id":"ws-2"}},
      {"tool":"focusNode","args":{"id":"n-trello"}}
    ]`)
    const executed = await simulateExecution(actions)
    expect(executed).toEqual([
      'switchWorkspace({"id":"ws-2"})',
      'focusNode({"id":"n-trello"})',
    ])
    // Order preserved
    expect(executed[0]).toContain('switchWorkspace')
    expect(executed[1]).toContain('focusNode')
  })

  it('sequential: openNode → arrangeNodes', async () => {
    const actions = parsePlan(`[
      {"tool":"openNode","args":{"type":"terminal"}},
      {"tool":"arrangeNodes","args":{"strategy":"grid"}}
    ]`)
    const executed = await simulateExecution(actions)
    expect(executed[0]).toContain('openNode')
    expect(executed[1]).toContain('arrangeNodes')
  })

  it('three steps: switchWorkspace → focusNode → fitAll (if zoom out after)', async () => {
    const actions = parsePlan(`[
      {"tool":"switchWorkspace","args":{"id":"ws-2"}},
      {"tool":"focusNode","args":{"id":"n1"}},
      {"tool":"fitAll","args":{}}
    ]`)
    expect(actions).toHaveLength(3)
    expect(actions.map(a => a.tool)).toEqual(['switchWorkspace', 'focusNode', 'fitAll'])
  })

  it('parallel-style: multiple openNode in one plan', async () => {
    const actions = parsePlan(`[
      {"tool":"openNode","args":{"type":"terminal"}},
      {"tool":"openNode","args":{"type":"browser"}},
      {"tool":"openNode","args":{"type":"note"}}
    ]`)
    expect(actions).toHaveLength(3)
    expect(actions.every(a => a.tool === 'openNode')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Expected plans for voice commands — what the LLM SHOULD return
// ---------------------------------------------------------------------------

describe('expected plans for voice commands', () => {
  // Helper: verify a plan has the right tools in order
  function expectPlan(plan: PlannedAction[], expectedTools: string[]) {
    expect(plan.map(a => a.tool)).toEqual(expectedTools)
  }

  describe('single-step commands', () => {
    it('"show me all nodes" → [fitAll]', () => {
      const plan = parsePlan('[{"tool":"fitAll","args":{}}]')
      expectPlan(plan, ['fitAll'])
    })

    it('"open a terminal" → [openNode(terminal)]', () => {
      const plan = parsePlan('[{"tool":"openNode","args":{"type":"terminal"}}]')
      expectPlan(plan, ['openNode'])
      expect(plan[0].args.type).toBe('terminal')
    })

    it('"focus the claude window" → [focusNode]', () => {
      const plan = parsePlan('[{"tool":"focusNode","args":{"id":"n-claude"}}]')
      expectPlan(plan, ['focusNode'])
    })

    it('"organize by type" → [arrangeNodes(by-type)]', () => {
      const plan = parsePlan('[{"tool":"arrangeNodes","args":{"strategy":"by-type"}}]')
      expectPlan(plan, ['arrangeNodes'])
      expect(plan[0].args.strategy).toBe('by-type')
    })

    it('"close the browser" → [removeNode]', () => {
      const plan = parsePlan('[{"tool":"removeNode","args":{"id":"n-browser"}}]')
      expectPlan(plan, ['removeNode'])
    })
  })

  describe('multi-step commands', () => {
    it('"show me trello from Work" → [switchWorkspace, focusNode]', () => {
      const plan = parsePlan(`[
        {"tool":"switchWorkspace","args":{"id":"ws-work"}},
        {"tool":"focusNode","args":{"id":"n-trello"}}
      ]`)
      expectPlan(plan, ['switchWorkspace', 'focusNode'])
    })

    it('"open terminal and browser" → [openNode, openNode]', () => {
      const plan = parsePlan(`[
        {"tool":"openNode","args":{"type":"terminal"}},
        {"tool":"openNode","args":{"type":"browser"}}
      ]`)
      expectPlan(plan, ['openNode', 'openNode'])
      expect(plan[0].args.type).toBe('terminal')
      expect(plan[1].args.type).toBe('browser')
    })

    it('"go to Work and open a terminal" → [switchWorkspace, openNode]', () => {
      const plan = parsePlan(`[
        {"tool":"switchWorkspace","args":{"id":"ws-work"}},
        {"tool":"openNode","args":{"type":"terminal"}}
      ]`)
      expectPlan(plan, ['switchWorkspace', 'openNode'])
    })

    it('"close browser and focus terminal" → [removeNode, focusNode]', () => {
      const plan = parsePlan(`[
        {"tool":"removeNode","args":{"id":"n-browser"}},
        {"tool":"focusNode","args":{"id":"n-terminal"}}
      ]`)
      expectPlan(plan, ['removeNode', 'focusNode'])
    })

    it('"open a terminal, organize, and zoom to fit" → [openNode, arrangeNodes, fitAll]', () => {
      const plan = parsePlan(`[
        {"tool":"openNode","args":{"type":"terminal"}},
        {"tool":"arrangeNodes","args":{"strategy":"grid"}},
        {"tool":"fitAll","args":{}}
      ]`)
      expectPlan(plan, ['openNode', 'arrangeNodes', 'fitAll'])
    })

    it('"switch to Home and show everything" → [switchWorkspace, fitAll]', () => {
      const plan = parsePlan(`[
        {"tool":"switchWorkspace","args":{"id":"ws-home"}},
        {"tool":"fitAll","args":{}}
      ]`)
      expectPlan(plan, ['switchWorkspace', 'fitAll'])
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('empty array is valid (no actions)', () => {
    const actions = parsePlan('[]')
    expect(actions).toEqual([])
  })

  it('extra whitespace is handled', () => {
    const actions = parsePlan('  \n  [{"tool":"fitAll","args":{}}]  \n  ')
    expect(actions).toEqual([{ tool: 'fitAll', args: {} }])
  })

  it('all action tools are valid in plans', () => {
    const READ_TOOLS = new Set(['listNodes', 'listWorkspaces', 'getCamera'])
    const actionTools = MCP_TOOLS.filter(t => !READ_TOOLS.has(t.name))

    for (const tool of actionTools) {
      const plan = parsePlan(`[{"tool":"${tool.name}","args":{}}]`)
      expect(plan[0].tool).toBe(tool.name)
    }
  })

  it('read tools are still valid in parsePlan (no restriction at parse level)', () => {
    // parsePlan validates against ALL tools, not just action tools
    // The restriction is at the prompt level, not the parser
    const plan = parsePlan('[{"tool":"listNodes","args":{}}]')
    expect(plan[0].tool).toBe('listNodes')
  })

  it('preserves complex args', () => {
    const plan = parsePlan('[{"tool":"openNode","args":{"type":"terminal","props":{"cwd":"/home/user"}}}]')
    expect(plan[0].args).toEqual({ type: 'terminal', props: { cwd: '/home/user' } })
  })
})
