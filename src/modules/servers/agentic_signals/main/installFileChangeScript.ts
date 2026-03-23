import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, chmodSync } from 'fs'
import { AGENT_SIGNAL_PORT } from '../shared/constants'

/**
 * Installs `canvaflow-log-change` — a PostToolUse hook script that:
 * 1. Reads the tool input JSON from stdin
 * 2. Extracts the file_path
 * 3. Reports the change to the signal server
 */
export function installFileChangeScript(): string {
  const binDir = join(homedir(), '.canvaflow', 'bin')
  mkdirSync(binDir, { recursive: true })
  const scriptPath = join(binDir, 'canvaflow-log-change')

  const script = `#!/bin/sh
# canvaflow-log-change — PostToolUse hook for file change tracking
# Reads JSON from stdin, extracts file_path and tool_name, reports to signal server.
# Env: CANVAFLOW_NODE_ID, CANVAFLOW_PORT

NODE_ID="\${CANVAFLOW_NODE_ID:-}"
PORT="\${CANVAFLOW_PORT:-${AGENT_SIGNAL_PORT}}"
if [ -z "$NODE_ID" ]; then exit 0; fi

# Read stdin (the hook JSON payload)
INPUT="$(cat)"

# Extract file_path and tool_name using basic tools (no jq dependency)
FILE_PATH="$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\\(.*\\)"/\\1/')"
TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\\(.*\\)"/\\1/')"

if [ -z "$FILE_PATH" ]; then exit 0; fi

curl -sf -X POST "http://127.0.0.1:\${PORT}/agent-file-change" \\
  -H "Content-Type: application/json" \\
  -d "{\\"nodeId\\":\\"\${NODE_ID}\\",\\"filePath\\":\\"\${FILE_PATH}\\",\\"toolName\\":\\"\${TOOL_NAME}\\"}" \\
  > /dev/null 2>&1 || true
`

  writeFileSync(scriptPath, script, 'utf-8')
  chmodSync(scriptPath, 0o755)
  console.log('[agent] File change script installed at', scriptPath)
  return scriptPath
}
