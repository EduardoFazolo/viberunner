import { useEffect } from 'react'
import { useNodeStore } from '../../../../renderer/src/stores/nodeStore'
import { logAgentDebug, summarizeText } from '../shared/debug'

export function useAgentStatus(): void {
  useEffect(() => {
    return window.agent?.onStatus((signal) => {
      logAgentDebug('renderer-hook', 'received-agent-status', {
        nodeId: signal.nodeId,
        status: signal.status,
        message: signal.message ? summarizeText(signal.message) : '',
      })
      useNodeStore.getState().setAgentStatus(signal.nodeId, signal.status, signal.message)
    })
  }, [])
}
