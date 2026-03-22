import type React from 'react'
import { maestroPlugin } from './maestro'

export interface Plugin {
  id: string
  SettingsSection?: React.ComponentType
  CanvasMount?: React.ComponentType
}

export const plugins: Plugin[] = [maestroPlugin]
