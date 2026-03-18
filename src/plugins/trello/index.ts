/**
 * Trello plugin — renderer-side manifest.
 *
 * Must NOT import anything from main/handlers.ts or Node.js/Electron modules.
 * Main-process handler registration is done in src/main/index.ts.
 */
import { TrelloNode } from './renderer/TrelloNode'
import type { CanvaFlowPlugin } from '../types'

export const trelloPlugin: CanvaFlowPlugin = {
  id: 'trello',
  nodeType: 'trello',
  defaultSize: { width: 900, height: 700 },
  defaultTitle: 'Trello',
  component: TrelloNode,
  keepAlive: true,
  sidebarLabel: 'Trello',
}
