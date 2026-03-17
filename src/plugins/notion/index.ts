/**
 * Notion plugin — renderer-side manifest.
 *
 * This file is imported by the renderer entry (src/renderer/src/main.tsx).
 * It must NOT import anything from main/handlers.ts or any Node.js/Electron
 * modules, as the renderer bundle runs in a browser context.
 *
 * Main-process handler registration is done separately in src/main/index.ts
 * by directly importing registerNotionHandlers from ./main/handlers.
 */
import { NotionNode } from './renderer/NotionNode'
import type { CanvaFlowPlugin } from '../types'

export const notionPlugin: CanvaFlowPlugin = {
  id: 'notion',
  nodeType: 'notion',
  defaultSize: { width: 900, height: 700 },
  defaultTitle: 'Notion',
  component: NotionNode,
  sidebarLabel: 'Notion',
}
