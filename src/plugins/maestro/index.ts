import { MaestroSettingsSection } from './renderer/MaestroSettingsSection'
import { MaestroCanvasMount } from './renderer/MaestroCanvasMount'

export const maestroPlugin = {
  id: 'maestro',
  SettingsSection: MaestroSettingsSection,
  CanvasMount: MaestroCanvasMount,
}
