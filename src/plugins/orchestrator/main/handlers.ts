import type { IpcMain, WebContents } from 'electron'
import { runOrchestrator, cancelOrchestrator } from './runner'
import type { OrchestratorStartPayload } from '../shared/types'

let _getWebContents: (() => WebContents | null) | null = null

export function registerOrchestratorHandlers(
  ipcMain: IpcMain,
  getWebContents: () => WebContents | null,
): void {
  _getWebContents = getWebContents

  ipcMain.handle(
    'orchestrator:start',
    async (_event, orchestratorId: string, payload: OrchestratorStartPayload) => {
      const wc = _getWebContents?.()
      if (!wc) throw new Error('No renderer window available')
      runOrchestrator(payload, orchestratorId, wc)
      return { ok: true }
    },
  )

  ipcMain.handle('orchestrator:cancel', (_event, orchestratorId: string) => {
    cancelOrchestrator(orchestratorId)
  })
}
