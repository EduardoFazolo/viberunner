import { ipcMain, type WebContents } from 'electron'
import {
  getWorkspaces,
  getNodes,
  getNodeMetadata,
  getCamera,
  getAppState,
} from '../database'
import { MCP_TOOLS } from './tools'

// ---------------------------------------------------------------------------
// State — renderer webContents ref, set during registration
// ---------------------------------------------------------------------------

let _getWebContents: (() => WebContents | null) | null = null

// ---------------------------------------------------------------------------
// Helpers — send action to renderer and await result
// ---------------------------------------------------------------------------

let _callId = 0

function callRenderer(action: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const wc = _getWebContents?.()
    if (!wc) { reject(new Error('No renderer available')); return }

    const id = ++_callId
    const channel = `mcp:result:${id}`

    const timeout = setTimeout(() => {
      ipcMain.removeHandler(channel)
      reject(new Error(`MCP action "${action}" timed out`))
    }, 10_000)

    ipcMain.handleOnce(channel, (_e, result: unknown) => {
      clearTimeout(timeout)
      return result
    })

    wc.send('mcp:action', { id, action, params })
  })
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // -- Read tools --------------------------------------------------------
    case 'listNodes': {
      const workspaceId = (input.workspaceId as string) || getAppState('lastWorkspaceId')
      if (!workspaceId) return { nodes: [] }

      const rows = getNodes(workspaceId)
      const nodeIds = rows.map((r) => r.id)
      const metaRows = nodeIds.length > 0 ? getNodeMetadata(nodeIds) : []
      const metaMap = new Map(metaRows.map((m) => [m.nodeId, m]))

      const nodes = rows.map((r) => {
        const meta = metaMap.get(r.id)
        let tags: string[] = []
        try { tags = JSON.parse(meta?.tags ?? '[]') } catch {}
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          minimized: r.minimized === 1,
          createdAt: r.createdAt,
          focusCount: meta?.focusCount ?? 0,
          lastFocusedAt: meta?.lastFocusedAt ?? 0,
          totalFocusDuration: meta?.totalFocusDuration ?? 0,
          tags,
          description: meta?.description ?? null,
          pinned: (meta?.pinned ?? 0) === 1,
        }
      })
      return { nodes }
    }

    case 'listWorkspaces': {
      const workspaces = getWorkspaces()
      return {
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          path: w.path,
          description: w.description ?? null,
          lastOpenedAt: w.lastOpenedAt,
        })),
        activeWorkspaceId: getAppState('lastWorkspaceId'),
      }
    }

    case 'getCamera': {
      const wsId = getAppState('lastWorkspaceId')
      if (!wsId) return { x: 0, y: 0, zoom: 1 }
      const cam = getCamera(wsId)
      return cam ?? { x: 0, y: 0, zoom: 1 }
    }

    // -- Write tools (delegate to renderer) --------------------------------
    case 'focusNode':
    case 'openNode':
    case 'removeNode':
    case 'setCamera':
    case 'switchWorkspace':
    case 'arrangeNodes':
    case 'fitAll':
      return callRenderer(name, input)

    default:
      throw new Error(`Unknown MCP tool: ${name}`)
  }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerMcpHandlers(getWebContents: () => WebContents | null): void {
  _getWebContents = getWebContents

  // Expose tool list to renderer (for building system prompts)
  ipcMain.handle('mcp:getTools', () => MCP_TOOLS)

  // Execute a single tool call
  ipcMain.handle('mcp:execute', async (_e, name: string, input: Record<string, unknown>) => {
    try {
      const result = await executeTool(name, input)
      return { ok: true, result }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}
