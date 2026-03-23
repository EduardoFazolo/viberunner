import type React from 'react'
import { maestroPlugin } from './maestro'
import { OrchestratorMount } from './orchestrator'

export interface Plugin {
  id: string
  SettingsSection?: React.ComponentType
  CanvasMount?: React.ComponentType
}

export const plugins: Plugin[] = [
  maestroPlugin,
  { id: 'orchestrator', CanvasMount: OrchestratorMount },
]
