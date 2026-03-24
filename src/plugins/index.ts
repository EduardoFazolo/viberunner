import type React from 'react'
import { OrchestratorMount } from './orchestrator'

export interface Plugin {
  id: string
  SettingsSection?: React.ComponentType
  CanvasMount?: React.ComponentType
}

export const plugins: Plugin[] = [
  { id: 'orchestrator', CanvasMount: OrchestratorMount },
]
