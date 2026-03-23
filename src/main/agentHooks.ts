import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'fs'
import { AGENT_SIGNAL_PORT } from './agentSignalServer'

export function setupAgentTools(): void {
  try { installSignalScript() } catch (err) { console.warn('[agent] Could not install signal script:', err) }
  try { installClaudeHooks() } catch (err) { console.warn('[agent] Could not install Claude hooks:', err) }
}

function installSignalScript(): void {
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
}

function installClaudeHooks(): void {
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  let settings: Record<string, any> = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  }

  const signalBin = join(homedir(), '.canvaflow', 'bin', 'canvaflow-signal')
  const cfHooks: Record<string, any[]> = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${signalBin} thinking` }] }],
    Stop: [{ hooks: [{ type: 'command', command: `${signalBin} done` }] }],
    PreToolUse: [
      { matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: `${signalBin} modifying_files` }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: `${signalBin} executing` }] },
    ],
  }

  if (!settings.hooks) settings.hooks = {}
  for (const [event, hooks] of Object.entries(cfHooks)) {
    const existing: any[] = settings.hooks[event] ?? []
    // Remove previous canvaflow entries to keep idempotent
    const filtered = existing.filter((h: any) => {
      const cmd: string = h?.hooks?.[0]?.command ?? h?.command ?? ''
      return !cmd.includes('.canvaflow')
    })
    settings.hooks[event] = [...filtered, ...hooks]
  }

  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log('[agent] Claude hooks installed at', settingsPath)
}
