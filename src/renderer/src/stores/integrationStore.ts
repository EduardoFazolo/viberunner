import { create } from 'zustand'

export interface WorkspaceIntegration {
  workspaceId: string
  provider: string
  authType: string
  accessToken: string
  config: string
  createdAt: number
  updatedAt: number
}

interface IntegrationStore {
  byWorkspace: Record<string, WorkspaceIntegration[]>
  loading: Record<string, boolean>
  load: (workspaceId: string) => Promise<void>
  save: (row: WorkspaceIntegration) => Promise<void>
  remove: (workspaceId: string, provider: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationStore>((set, get) => ({
  byWorkspace: {},
  loading: {},

  load: async (workspaceId) => {
    if (get().loading[workspaceId]) return

    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
    }))

    try {
      const rows = await window.integrations.getAll(workspaceId)
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: rows },
        loading: { ...state.loading, [workspaceId]: false },
      }))
    } catch {
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
      }))
    }
  },

  save: async (row) => {
    await window.integrations.save(row)
    set((state) => {
      const current = state.byWorkspace[row.workspaceId] ?? []
      const next = current.some((entry) => entry.provider === row.provider)
        ? current.map((entry) => (entry.provider === row.provider ? row : entry))
        : [...current, row]

      return {
        byWorkspace: { ...state.byWorkspace, [row.workspaceId]: next },
      }
    })
  },

  remove: async (workspaceId, provider) => {
    await window.integrations.delete(workspaceId, provider)
    set((state) => ({
      byWorkspace: {
        ...state.byWorkspace,
        [workspaceId]: (state.byWorkspace[workspaceId] ?? []).filter((entry) => entry.provider !== provider),
      },
    }))
  },
}))
