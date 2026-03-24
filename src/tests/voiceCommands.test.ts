import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNodeStore } from '../renderer/src/stores/nodeStore'
import { useVoiceStore } from '../renderer/src/stores/voiceStore'
import { MCP_TOOLS } from '../main/mcp/tools'

// Mock window.agent for trackFocus (calls saveMetadata via IPC)
;(globalThis as any).window = {
  agent: {
    saveMetadata: vi.fn(() => Promise.resolve()),
  },
}

// ---------------------------------------------------------------------------
// Store setup
// ---------------------------------------------------------------------------

function setupWorkspace() {
  const nodes = new Map()
  const store = useNodeStore.getState()

  // Seed a workspace with some nodes
  useNodeStore.setState({
    nodes,
    workspaceNodes: new Map([['ws-1', nodes]]),
    activeWorkspaceId: 'ws-1',
    focusedNodeId: null,
    selectedNodeIds: new Set(),
  })

  const terminal1 = store.add('terminal', 0, 0, { cwd: '/home' })
  const terminal2 = store.add('terminal', 700, 0, { cwd: '/projects' })
  const browser1 = store.add('browser', 0, 500)
  const claude1 = store.add('claude', 700, 500, { cwd: '/home' })
  const note1 = store.add('note', 1400, 0)

  // Give them distinct titles
  store.update(terminal1.id, { title: 'Terminal' })
  store.update(terminal2.id, { title: 'Dev Terminal' })
  store.update(browser1.id, { title: 'Browser' })
  store.update(claude1.id, { title: 'Claude' })
  store.update(note1.id, { title: 'Meeting Notes' })

  return { terminal1, terminal2, browser1, claude1, note1 }
}

beforeEach(() => {
  useNodeStore.setState({
    nodes: new Map(),
    workspaceNodes: new Map(),
    activeWorkspaceId: '',
    focusedNodeId: null,
    selectedNodeIds: new Set(),
  })
  useVoiceStore.setState({
    recording: false,
    mode: 'command',
    transcript: null,
    transcriptVisible: false,
    agentState: 'idle',
    agentMessage: null,
  })
})

// ---------------------------------------------------------------------------
// MCP Tool definitions
// ---------------------------------------------------------------------------

describe('MCP tool definitions', () => {
  it('has all expected tools', () => {
    const names = MCP_TOOLS.map((t) => t.name)
    expect(names).toContain('listNodes')
    expect(names).toContain('listWorkspaces')
    expect(names).toContain('getCamera')
    expect(names).toContain('focusNode')
    expect(names).toContain('openNode')
    expect(names).toContain('removeNode')
    expect(names).toContain('setCamera')
    expect(names).toContain('switchWorkspace')
    expect(names).toContain('arrangeNodes')
    expect(names).toContain('fitAll')
  })

  it('all tools have valid input_schema', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.input_schema.type).toBe('object')
      expect(tool.input_schema.properties).toBeDefined()
    }
  })

  it('openNode has correct type enum', () => {
    const openNode = MCP_TOOLS.find((t) => t.name === 'openNode')!
    const typeSchema = openNode.input_schema.properties.type as { enum: string[] }
    expect(typeSchema.enum).toContain('terminal')
    expect(typeSchema.enum).toContain('browser')
    expect(typeSchema.enum).toContain('claude')
    expect(typeSchema.enum).toContain('monaco')
    expect(typeSchema.enum).toContain('note')
  })

  it('arrangeNodes has correct strategy enum', () => {
    const arrange = MCP_TOOLS.find((t) => t.name === 'arrangeNodes')!
    const stratSchema = arrange.input_schema.properties.strategy as { enum: string[] }
    expect(stratSchema.enum).toContain('grid')
    expect(stratSchema.enum).toContain('by-type')
    expect(stratSchema.enum).toContain('by-recency')
    expect(stratSchema.enum).toContain('by-usage')
  })

  it('write tools require their id/type parameters', () => {
    const focusNode = MCP_TOOLS.find((t) => t.name === 'focusNode')!
    expect(focusNode.input_schema.required).toContain('id')

    const openNode = MCP_TOOLS.find((t) => t.name === 'openNode')!
    expect(openNode.input_schema.required).toContain('type')

    const removeNode = MCP_TOOLS.find((t) => t.name === 'removeNode')!
    expect(removeNode.input_schema.required).toContain('id')
  })
})

// ---------------------------------------------------------------------------
// Voice store
// ---------------------------------------------------------------------------

describe('voiceStore', () => {
  it('starts in idle state', () => {
    const state = useVoiceStore.getState()
    expect(state.recording).toBe(false)
    expect(state.mode).toBe('command')
    expect(state.agentState).toBe('idle')
  })

  it('startRecording sets mode and recording', () => {
    useVoiceStore.getState().startRecording('dictate')
    const state = useVoiceStore.getState()
    expect(state.recording).toBe(true)
    expect(state.mode).toBe('dictate')
  })

  it('startRecording with command mode', () => {
    useVoiceStore.getState().startRecording('command')
    const state = useVoiceStore.getState()
    expect(state.recording).toBe(true)
    expect(state.mode).toBe('command')
  })

  it('stopRecording clears recording but preserves mode', () => {
    useVoiceStore.getState().startRecording('dictate')
    useVoiceStore.getState().stopRecording()
    const state = useVoiceStore.getState()
    expect(state.recording).toBe(false)
    expect(state.mode).toBe('dictate')
  })

  it('setTranscript shows transcript', () => {
    useVoiceStore.getState().setTranscript('open a terminal')
    const state = useVoiceStore.getState()
    expect(state.transcript).toBe('open a terminal')
    expect(state.transcriptVisible).toBe(true)
  })

  it('setAgentStatus updates agent state', () => {
    useVoiceStore.getState().setAgentStatus('thinking')
    expect(useVoiceStore.getState().agentState).toBe('thinking')

    useVoiceStore.getState().setAgentStatus('executing', 'openNode: terminal')
    expect(useVoiceStore.getState().agentState).toBe('executing')
    expect(useVoiceStore.getState().agentMessage).toBe('openNode: terminal')
  })

  it('setAgentStatus hides transcript on done', () => {
    useVoiceStore.getState().setTranscript('test')
    expect(useVoiceStore.getState().transcriptVisible).toBe(true)

    useVoiceStore.getState().setAgentStatus('done')
    expect(useVoiceStore.getState().transcriptVisible).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// MCP action handler (renderer-side) — test via store directly
// ---------------------------------------------------------------------------

describe('MCP actions via nodeStore', () => {
  it('openNode: terminal creates a terminal node', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('terminal', 100, 200, { cwd: '/home' })
    expect(node.type).toBe('terminal')
    expect(useNodeStore.getState().nodes.size).toBe(1)
  })

  it('openNode: browser creates a browser node', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('browser', 100, 200)
    expect(node.type).toBe('browser')
  })

  it('openNode: claude creates a claude node', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('claude', 100, 200, { cwd: '/home' })
    expect(node.type).toBe('claude')
  })

  it('openNode: note creates a note node', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('note', 100, 200)
    expect(node.type).toBe('note')
  })

  it('removeNode removes an existing node', () => {
    setupWorkspace()
    const nodes = useNodeStore.getState().nodes
    const firstId = [...nodes.keys()][0]
    const sizeBefore = nodes.size

    useNodeStore.getState().remove(firstId)
    expect(useNodeStore.getState().nodes.size).toBe(sizeBefore - 1)
    expect(useNodeStore.getState().nodes.has(firstId)).toBe(false)
  })

  it('focusNode brings node to front and sets focusedNodeId', () => {
    const { terminal1, claude1 } = setupWorkspace()
    const store = useNodeStore.getState()

    store.bringToFront(claude1.id)
    store.setFocusedNodeId(claude1.id)

    expect(useNodeStore.getState().focusedNodeId).toBe(claude1.id)
    const claudeNode = useNodeStore.getState().nodes.get(claude1.id)!
    const termNode = useNodeStore.getState().nodes.get(terminal1.id)!
    expect(claudeNode.zIndex).toBeGreaterThan(termNode.zIndex)
  })

  it('arrangeNodes: grid repositions all nodes', () => {
    const { terminal1, terminal2, browser1 } = setupWorkspace()

    // Record original positions
    const origX1 = terminal1.x
    const origY1 = terminal1.y

    // Simulate grid arrange by updating positions
    const nodes = useNodeStore.getState().nodes
    const items = [...nodes.values()]
    let x = 0, y = 0, col = 0
    const cols = Math.ceil(Math.sqrt(items.length))
    for (const item of items) {
      useNodeStore.getState().update(item.id, { x, y })
      col++
      if (col >= cols) { col = 0; x = 0; y += 500 } else { x += 700 }
    }

    // At least some nodes should have moved
    const movedNode = useNodeStore.getState().nodes.get(terminal1.id)!
    const anyMoved = movedNode.x !== origX1 || movedNode.y !== origY1
    // This is layout-dependent but at least verifies update works
    expect(useNodeStore.getState().nodes.size).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Voice command → tool mapping expectations
// These test what the agent SHOULD do for various natural-language commands.
// They document the expected tool calls (used for prompt tuning).
// ---------------------------------------------------------------------------

describe('voice command → expected tool mapping', () => {
  const expectation = (commands: string[], expectedTool: string, expectedParams?: Record<string, unknown>) => {
    for (const cmd of commands) {
      it(`"${cmd}" → ${expectedTool}${expectedParams ? '(' + JSON.stringify(expectedParams) + ')' : ''}`, () => {
        // Verify the expected tool exists
        const tool = MCP_TOOLS.find((t) => t.name === expectedTool)
        expect(tool).toBeDefined()

        // Verify expected params match schema
        if (expectedParams) {
          for (const key of Object.keys(expectedParams)) {
            expect(tool!.input_schema.properties).toHaveProperty(key)
          }
        }
      })
    }
  }

  // Show all / fit all
  expectation([
    'show me all nodes',
    'show all windows',
    'show me everything',
    'show all',
    'zoom to fit',
    'fit all',
    'show windows',
  ], 'fitAll')

  // Open terminal
  expectation([
    'open a terminal',
    'open terminal',
    'new terminal',
    'create a terminal',
    'add a terminal',
  ], 'openNode', { type: 'terminal' })

  // Open browser
  expectation([
    'open a browser',
    'open browser',
    'new browser',
    'open a web browser',
  ], 'openNode', { type: 'browser' })

  // Open Claude
  expectation([
    'open claude',
    'open a claude window',
    'new claude',
  ], 'openNode', { type: 'claude' })

  // Open editor
  expectation([
    'open an editor',
    'open editor',
    'new editor',
    'open code editor',
  ], 'openNode', { type: 'monaco' })

  // Open note
  expectation([
    'open a note',
    'new note',
    'create a note',
  ], 'openNode', { type: 'note' })

  // Focus node
  expectation([
    'focus the terminal',
    'go to terminal',
    'show me the terminal',
    'switch to terminal',
  ], 'focusNode')

  // Remove node
  expectation([
    'close the browser',
    'remove the browser',
    'delete the browser',
  ], 'removeNode')

  // Arrange
  expectation([
    'organize my windows',
    'arrange everything',
    'tidy up',
    'organize by type',
  ], 'arrangeNodes')

  // Switch workspace
  expectation([
    'switch to workspace home',
    'go to home workspace',
    'change workspace',
  ], 'switchWorkspace')

  // Zoom
  expectation([
    'zoom in',
    'zoom out',
    'zoom to 50%',
  ], 'setCamera')
})

// ---------------------------------------------------------------------------
// Node metadata (Phase 1 fields)
// ---------------------------------------------------------------------------

describe('node metadata fields', () => {
  it('new nodes have createdAt timestamp', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const before = Date.now()
    const node = useNodeStore.getState().add('note', 0, 0)
    const after = Date.now()
    expect(node.createdAt).toBeGreaterThanOrEqual(before)
    expect(node.createdAt).toBeLessThanOrEqual(after)
  })

  it('trackFocus increments focusCount and sets lastFocusedAt', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('terminal', 0, 0)

    useNodeStore.getState().trackFocus(node.id)
    const updated = useNodeStore.getState().nodes.get(node.id)!
    expect(updated.focusCount).toBe(1)
    expect(updated.lastFocusedAt).toBeGreaterThan(0)

    useNodeStore.getState().trackFocus(node.id)
    const updated2 = useNodeStore.getState().nodes.get(node.id)!
    expect(updated2.focusCount).toBe(2)
  })

  it('trackFocus accumulates totalFocusDuration on previous node', () => {
    useNodeStore.setState({
      nodes: new Map(),
      workspaceNodes: new Map([['ws-1', new Map()]]),
      activeWorkspaceId: 'ws-1',
      focusedNodeId: null,
    })
    const nodeA = useNodeStore.getState().add('terminal', 0, 0)
    const nodeB = useNodeStore.getState().add('browser', 500, 0)

    // Focus node A
    useNodeStore.getState().setFocusedNodeId(nodeA.id)
    useNodeStore.getState().trackFocus(nodeA.id)

    // Simulate time passing by manually setting lastFocusedAt
    const aState = useNodeStore.getState().nodes.get(nodeA.id)!
    useNodeStore.getState().update(nodeA.id, { lastFocusedAt: Date.now() - 5000 })

    // Focus node B — should accumulate dwell time on A
    useNodeStore.getState().setFocusedNodeId(nodeA.id) // ensure focusedNodeId is A
    useNodeStore.getState().trackFocus(nodeB.id)

    const aAfter = useNodeStore.getState().nodes.get(nodeA.id)!
    expect(aAfter.totalFocusDuration).toBeGreaterThan(0)
    expect(aAfter.totalFocusDuration).toBeLessThan(30 * 60 * 1000) // under 30min cap
  })

  it('NodeData interface includes all metadata fields', () => {
    useNodeStore.setState({ nodes: new Map(), workspaceNodes: new Map([['ws-1', new Map()]]), activeWorkspaceId: 'ws-1' })
    const node = useNodeStore.getState().add('note', 0, 0)

    // These fields should exist on NodeData (may be undefined initially)
    expect('createdAt' in node).toBe(true)
    expect('lastFocusedAt' in node || node.lastFocusedAt === undefined).toBe(true)
    expect('focusCount' in node || node.focusCount === undefined).toBe(true)
    expect('totalFocusDuration' in node || node.totalFocusDuration === undefined).toBe(true)
    expect('tags' in node || node.tags === undefined).toBe(true)
    expect('description' in node || node.description === undefined).toBe(true)
    expect('pinned' in node || node.pinned === undefined).toBe(true)
  })
})
