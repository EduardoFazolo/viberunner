import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useWorkspaceStore, Workspace } from '../stores/workspaceStore'
import { useNodeStore, NodeData, NodeType } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'

// ---------------------------------------------------------------------------
// Convert DB row → NodeData
// ---------------------------------------------------------------------------

function rowToNode(row: any): NodeData {
  return {
    id: row.id,
    type: row.type as NodeType,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    title: row.title,
    minimized: row.minimized === 1,
    props: (() => {
      try { return JSON.parse(row.props) } catch { return {} }
    })(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspaceInit(): void {
  useEffect(() => {
    let cancelled = false

    async function init() {
      const api = window

      // Load settings and templates early
      useSettingsStore.getState().load()
      const { useTemplateStore } = await import('../stores/templateStore')
      useTemplateStore.getState().load()

      // Load all workspaces from DB
      let dbWorkspaces: Workspace[] = []
      try {
        dbWorkspaces = await api.workspace.getAll()
      } catch {
        // DB not ready yet (unlikely after initDatabase() in main)
      }

      if (cancelled) return

      // Determine active workspace
      let activeId: string | null = null

      if (dbWorkspaces.length > 0) {
        // Restore last-used workspace
        const lastId = await api.appState.get('lastWorkspaceId')
        const lastExists = dbWorkspaces.some((w: Workspace) => w.id === lastId)
        activeId = lastExists ? lastId : dbWorkspaces[0].id
      } else {
        // Create a default workspace (home directory)
        const home = await window.workspace.homedir()
        const defaultWs: Workspace = {
          id: nanoid(),
          name: 'Home',
          path: home,
          lastOpenedAt: Date.now(),
          color: null,
        }
        await api.workspace.save(defaultWs)
        dbWorkspaces = [defaultWs]
        activeId = defaultWs.id
      }

      if (cancelled) return

      useWorkspaceStore.setState({ workspaces: dbWorkspaces, activeId })

      // Load node summaries for all workspaces (for sidebar display)
      const summariesEntries = await Promise.all(
        dbWorkspaces.map(async (ws: Workspace) => {
          try {
            const rows = await window.canvas.getNodes(ws.id)
            return [ws.id, rows.map((r: any) => {
              let subtitle: string | undefined
              try { subtitle = r.type === 'browser' ? (JSON.parse(r.props)?.url ?? undefined) : undefined } catch {}
              return { id: r.id, title: r.title, type: r.type, subtitle }
            })] as const
          } catch {
            return [ws.id, []] as const
          }
        })
      )
      const nodeSummaries: Record<string, any[]> = {}
      for (const [id, summaries] of summariesEntries) nodeSummaries[id] = summaries
      useWorkspaceStore.setState({ nodeSummaries })

      // Load full canvas for the active workspace
      if (activeId) {
        await loadWorkspaceCanvas(activeId)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])
}

export async function loadWorkspaceCanvas(workspaceId: string): Promise<void> {
  const api = window

  try {
    const [nodeRows, cameraRow] = await Promise.all([
      api.canvas.getNodes(workspaceId),
      api.canvas.getCamera(workspaceId),
    ])

    // Hydrate node store
    const nodes = new Map<string, NodeData>()
    for (const row of nodeRows) {
      const node = rowToNode(row)
      nodes.set(node.id, node)
    }
    useNodeStore.setState({ nodes })

    // Update sidebar summaries for this workspace
    useWorkspaceStore.getState().setNodeSummaries(
      workspaceId,
      nodeRows.map((r: any) => {
        let subtitle: string | undefined
        try { subtitle = r.type === 'browser' ? (JSON.parse(r.props)?.url ?? undefined) : undefined } catch {}
        return { id: r.id, title: r.title, type: r.type, subtitle }
      })
    )

    // Hydrate camera
    if (cameraRow) {
      useCameraStore.setState({ camera: { x: cameraRow.x, y: cameraRow.y, zoom: cameraRow.zoom } })
    } else {
      useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
    }

    // Persist active workspace ID
    await api.appState.set('lastWorkspaceId', workspaceId)
  } catch (err) {
    console.error('[workspace] Failed to load canvas:', err)
    useNodeStore.setState({ nodes: new Map() })
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
  }
}
