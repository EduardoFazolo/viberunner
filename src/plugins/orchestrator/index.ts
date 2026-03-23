import { OrchestratorNode } from './renderer/OrchestratorNode'
import { SubagentNode } from './renderer/SubagentNode'
import { OrchestratorMount } from './orchestratorMount'
import type { CanvaFlowPlugin } from '../types'

export { OrchestratorMount }

export const orchestratorPlugin: CanvaFlowPlugin = {
  id: 'orchestrator',
  nodeType: 'orchestrator',
  defaultSize: { width: 520, height: 300 },
  defaultTitle: 'Orchestrator',
  component: OrchestratorNode,
  sidebarLabel: 'Orchestrator',
}

export const subagentPlugin: CanvaFlowPlugin = {
  id: 'subagent',
  nodeType: 'subagent',
  defaultSize: { width: 460, height: 180 },
  defaultTitle: 'Sub-agent',
  component: SubagentNode,
}
