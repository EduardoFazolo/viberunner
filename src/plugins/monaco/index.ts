import { MonacoNode } from './renderer/MonacoNode'
import type { CanvaFlowPlugin } from '../types'

export const monacoPlugin: CanvaFlowPlugin = {
  id: 'monaco',
  nodeType: 'monaco',
  defaultSize: { width: 1000, height: 640 },
  defaultTitle: 'Untitled',
  component: MonacoNode,
  sidebarLabel: 'Editor',
  shortcut: 'Meta+Shift+E',
}
