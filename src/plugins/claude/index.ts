import { ClaudeNode } from './renderer/ClaudeNode'
import type { CanvaFlowPlugin } from '../types'

export const claudePlugin: CanvaFlowPlugin = {
  id: 'claude',
  nodeType: 'claude',
  defaultSize: { width: 700, height: 480 },
  defaultTitle: 'Claude',
  component: ClaudeNode,
  keepAlive: true,
  sidebarLabel: 'Claude',
  shortcut: 'Meta+Shift+C',
}
