export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'modifying_files'
  | 'done'
  | 'error'
  | 'needs_permission'
  | 'needs_input'

export interface AgentSignal {
  nodeId: string
  status: AgentStatus
  message?: string
}
