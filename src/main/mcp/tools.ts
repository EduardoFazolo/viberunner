// ---------------------------------------------------------------------------
// MCP tool definitions — used by the voice agent (Claude) to understand
// what actions are available and their parameter schemas.
// ---------------------------------------------------------------------------

export interface ToolDef {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const MCP_TOOLS: ToolDef[] = [
  // -- Read tools ----------------------------------------------------------
  {
    name: 'listNodes',
    description:
      'List all nodes in the current workspace (or a specific one). ' +
      'Returns each node\'s id, type, title, position, size, and metadata ' +
      '(focusCount, lastFocusedAt, totalFocusDuration, tags, description, pinned, createdAt).',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace to query. Omit for the active workspace.',
        },
      },
    },
  },
  {
    name: 'listWorkspaces',
    description: 'List all workspaces with their id, name, path, description, and lastOpenedAt timestamp.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getCamera',
    description: 'Get the current camera position (x, y) and zoom level.',
    input_schema: { type: 'object', properties: {} },
  },

  // -- Write tools ---------------------------------------------------------
  {
    name: 'focusNode',
    description: 'Bring a node to the front and focus it. Also pans the camera to center on the node.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to focus.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'openNode',
    description:
      'Spawn a new node on the canvas. Types: terminal, browser, browserv2, note, files, ' +
      'claude, monaco, orchestrator, subagent. Props vary by type (e.g. { cwd } for terminal, ' +
      '{ url } for browser).',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['terminal', 'browser', 'browserv2', 'note', 'files', 'claude', 'monaco', 'orchestrator', 'subagent'],
          description: 'Node type to create.',
        },
        props: {
          type: 'object',
          description: 'Optional properties (e.g. { cwd: "/path" } for terminal, { url: "https://..." } for browser).',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'removeNode',
    description: 'Remove a node from the canvas.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to remove.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'setCamera',
    description:
      'Pan and zoom the camera. Animates smoothly to the target position. ' +
      'Use zoom=1 for default, lower values to zoom out (see more), higher to zoom in.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Camera X offset.' },
        y: { type: 'number', description: 'Camera Y offset.' },
        zoom: { type: 'number', description: 'Zoom level (0.05–5, default 1).' },
      },
      required: ['x', 'y', 'zoom'],
    },
  },
  {
    name: 'switchWorkspace',
    description: 'Switch to a different workspace by ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Workspace ID to switch to.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'arrangeNodes',
    description:
      'Auto-arrange all nodes on the canvas using a layout strategy. ' +
      'Strategies: "grid" (even grid), "by-type" (group same types together), ' +
      '"by-recency" (most recently focused nodes in center), ' +
      '"by-usage" (most focused nodes in center).',
    input_schema: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: ['grid', 'by-type', 'by-recency', 'by-usage'],
          description: 'Layout algorithm.',
        },
      },
      required: ['strategy'],
    },
  },
  {
    name: 'fitAll',
    description: 'Zoom the camera to fit all nodes in view.',
    input_schema: { type: 'object', properties: {} },
  },
]
