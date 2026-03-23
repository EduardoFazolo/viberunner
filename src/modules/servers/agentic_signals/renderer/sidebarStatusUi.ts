import type { AgentStatus } from '../shared/types'

export type SidebarAgentStatusUi = {
  isAgentActive: boolean
  needsUserInput: boolean
  isDone: boolean
  isThinking: boolean
}

export function getSidebarAgentStatusUi(agentStatus?: AgentStatus): SidebarAgentStatusUi {
  const needsUserInput = agentStatus === 'needs_permission' || agentStatus === 'needs_input'
  const isDone = agentStatus === 'done'
  const isThinking = agentStatus === 'thinking'

  return {
    isAgentActive: Boolean(agentStatus && agentStatus !== 'idle' && !needsUserInput && !isDone),
    needsUserInput,
    isDone,
    isThinking,
  }
}
