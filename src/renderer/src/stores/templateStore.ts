import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface NodeTemplate {
  id: string
  type: string
  title: string
  props: Record<string, unknown>
}

interface TemplateStore {
  templates: NodeTemplate[]
  loaded: boolean
  // Drag state: node being dragged from canvas toward sidebar
  draggingOverSidebar: boolean
  setDraggingOverSidebar: (v: boolean) => void
  // Drag state: template being dragged from sidebar to canvas
  draggedTemplate: NodeTemplate | null
  dragGhostPos: { x: number; y: number }
  startTemplateDrag: (t: NodeTemplate, x: number, y: number) => void
  updateTemplateDragPos: (x: number, y: number) => void
  endTemplateDrag: () => void
  // Persistence
  load: () => Promise<void>
  add: (t: Omit<NodeTemplate, 'id'>) => void
  remove: (id: string) => void
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: [],
  loaded: false,
  draggingOverSidebar: false,
  setDraggingOverSidebar: (v) => set({ draggingOverSidebar: v }),
  draggedTemplate: null,
  dragGhostPos: { x: 0, y: 0 },
  startTemplateDrag: (t, x, y) => set({ draggedTemplate: t, dragGhostPos: { x, y } }),
  updateTemplateDragPos: (x, y) => set({ dragGhostPos: { x, y } }),
  endTemplateDrag: () => set({ draggedTemplate: null }),

  load: async () => {
    try {
      const raw = await window.appState.get('nodeTemplates')
      if (raw) {
        const parsed = JSON.parse(raw) as NodeTemplate[]
        set({ templates: parsed, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  add: (t) => {
    const template: NodeTemplate = { id: nanoid(), ...t }
    const templates = [template, ...get().templates]
    set({ templates })
    try { window.appState.set('nodeTemplates', JSON.stringify(templates)) } catch {}
  },

  remove: (id) => {
    const templates = get().templates.filter(t => t.id !== id)
    set({ templates })
    try { window.appState.set('nodeTemplates', JSON.stringify(templates)) } catch {}
  },
}))
