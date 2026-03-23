export interface OrchestratorStartPayload {
  task: string
  markdown: string
  worldX: number
  worldY: number
  workspacePath?: string
}

export interface SubagentSpawnedEvent {
  orchestratorId: string
  agentId: string
  title: string
  task: string
  worldX: number
  worldY: number
  workspacePath?: string
}

export interface NoteUpdateEvent {
  agentId: string
  note: string
}

export interface OrchestratorStatusEvent {
  orchestratorId: string
  status: 'thinking' | 'streaming' | 'parsing' | 'spawning' | 'done' | 'error'
  message?: string
  /** Partial streamed text from Claude, shown in real-time */
  streamText?: string
}
