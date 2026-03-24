import { WindowPickerNode } from './renderer/WindowPickerNode'
import type { CanvaFlowPlugin } from '../types'

export const windowPickerPlugin: CanvaFlowPlugin = {
  id: 'windowpicker',
  nodeType: 'windowpicker',
  defaultSize: { width: 480, height: 400 },
  defaultTitle: 'Window',
  component: WindowPickerNode,
  sidebarLabel: 'Window Picker',
  shortcut: 'Meta+Shift+W',
}
