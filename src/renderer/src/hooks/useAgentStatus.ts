import { useEffect } from 'react'
import { useNodeStore } from '../stores/nodeStore'

export function useAgentStatus(): void {
  useEffect(() => {
    return window.agent?.onStatus((signal) => {
      useNodeStore.getState().setAgentStatus(signal.nodeId, signal.status as any, signal.message)
    })
  }, [])
}
