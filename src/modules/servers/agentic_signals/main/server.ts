import { createServer } from 'http'
import { WebContents } from 'electron'
import { logAgentDebug, summarizeText } from '../shared/debug'
import { AGENT_SIGNAL_PORT } from '../shared/constants'
import type { AgentSignal } from '../shared/types'

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
        logAgentDebug('signal-server', 'received-hook-signal', {
          nodeId: signal.nodeId,
          status: signal.status,
          message: signal.message ? summarizeText(signal.message) : '',
        })
        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) wc.send('agent:status', signal)
        res.writeHead(200).end()
      } catch {
        logAgentDebug('signal-server', 'invalid-hook-payload', {
          body: summarizeText(body),
        })
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
