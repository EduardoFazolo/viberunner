import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, chmodSync } from 'fs'
import { AGENT_SIGNAL_PORT } from '../shared/constants'

export function installSignalScript(): string {
  const binDir = join(homedir(), '.canvaflow', 'bin')
  mkdirSync(binDir, { recursive: true })
  const scriptPath = join(binDir, 'canvaflow-signal')
  const script = [
    '#!/bin/sh',
    '# canvaflow-signal — lightweight agent status reporter',
    '# Usage: canvaflow-signal <status> [message]',
    '# Env: CANVAFLOW_NODE_ID, CANVAFLOW_PORT',
    'NODE_ID="${CANVAFLOW_NODE_ID:-}"',
    'STATUS="$1"',
    'MESSAGE="${2:-}"',
    `PORT="\${CANVAFLOW_PORT:-${AGENT_SIGNAL_PORT}}"`,
    'if [ -z "$NODE_ID" ] || [ -z "$STATUS" ]; then exit 0; fi',
    'curl -sf -X POST "http://127.0.0.1:${PORT}/agent-signal" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d "{\\"nodeId\\":\\"${NODE_ID}\\",\\"status\\":\\"${STATUS}\\",\\"message\\":\\"${MESSAGE}\\"}" \\',
    '  > /dev/null 2>&1 || true',
  ].join('\n')
  writeFileSync(scriptPath, script, 'utf-8')
  chmodSync(scriptPath, 0o755)
  console.log('[agent] Signal script installed at', scriptPath)
  return scriptPath
}
