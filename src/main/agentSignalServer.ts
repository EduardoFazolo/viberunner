import { createServer } from 'http'
import { WebContents } from 'electron'

export const AGENT_SIGNAL_PORT = 39847

export type AgentStatus = 'idle' | 'executing' | 'modifying_files' | 'done' | 'error'

export interface AgentSignal {
  nodeId: string
  status: AgentStatus
  message?: string
}

export function startAgentSignalServer(getWebContents: () => WebContents | null): void {
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/agent-signal') {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const signal = JSON.parse(body) as AgentSignal
        if (!signal.nodeId || !signal.status) { res.writeHead(400).end(); return }
        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) wc.send('agent:status', signal)
        res.writeHead(200).end()
      } catch {
        res.writeHead(400).end()
      }
    })
  })

  server.listen(AGENT_SIGNAL_PORT, '127.0.0.1', () => {
    console.log(`[agent] Signal server listening on port ${AGENT_SIGNAL_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[agent] Port ${AGENT_SIGNAL_PORT} already in use — signal server not started`)
    } else {
      console.error('[agent] Signal server error:', err)
    }
  })
}
