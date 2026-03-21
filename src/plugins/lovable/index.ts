import { LovableNode } from './renderer/LovableNode'
import type { CanvaFlowPlugin } from '../types'

export const lovablePlugin: CanvaFlowPlugin = {
  id: 'lovable',
  nodeType: 'lovable',
  defaultSize: { width: 920, height: 720 },
  defaultTitle: 'Lovable',
  component: LovableNode,
  keepAlive: true,
  sidebarLabel: 'Lovable',
  shortcut: 'Meta+Shift+L',
}
