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

export interface AgentFileChange {
  nodeId: string
  filePath: string
  toolName: string // 'Write' | 'Edit' | 'MultiEdit'
}
