import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'

export function installClaudeHooks(signalBin: string): void {
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  let settings: Record<string, any> = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  }

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
    const filtered = existing.filter((hook: any) => {
      const cmd: string = hook?.hooks?.[0]?.command ?? hook?.command ?? ''
      return !cmd.includes('.canvaflow')
    })
    settings.hooks[event] = [...filtered, ...hooks]
  }

  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log('[agent] Claude hooks installed at', settingsPath)
}
