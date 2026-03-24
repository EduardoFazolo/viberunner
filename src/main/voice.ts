import { ipcMain, app, type WebContents } from 'electron'
import { execFile, spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, watch, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HANDY_APP_PATH = '/Applications/Handy.app'
const HANDY_CLI = '/Applications/Handy.app/Contents/MacOS/handy'

function getBridgeDir(): string {
  return join(app.getPath('userData'), 'voice')
}

function getBridgeScriptPath(): string {
  return join(getBridgeDir(), 'handy-bridge.sh')
}

function getTranscriptPath(): string {
  return join(getBridgeDir(), 'transcript.txt')
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function isHandyInstalled(): boolean {
  return existsSync(HANDY_APP_PATH)
}

// ---------------------------------------------------------------------------
// Installation via Homebrew
// ---------------------------------------------------------------------------

function installHandy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('/bin/zsh', ['-lc', 'brew install --cask handy'], {
      stdio: 'pipe',
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`brew install failed (exit ${code}): ${stderr}`))
    })
    proc.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Bridge script — Handy calls this with transcript as $1
// ---------------------------------------------------------------------------

function ensureBridgeScript(): void {
  const dir = getBridgeDir()
  mkdirSync(dir, { recursive: true })

  const scriptPath = getBridgeScriptPath()
  const transcriptPath = getTranscriptPath()

  // The script writes the transcript to a file that we watch via fs.watch
  const script = `#!/bin/bash
# CanvaFlow ↔ Handy bridge — receives transcript text as $1
printf '%s' "$1" > "${transcriptPath}"
`
  writeFileSync(scriptPath, script, { mode: 0o755 })
}

// ---------------------------------------------------------------------------
// Transcript watcher
// ---------------------------------------------------------------------------

let _watcher: ReturnType<typeof watch> | null = null
let _getWebContents: (() => WebContents | null) | null = null

function startTranscriptWatcher(): void {
  if (_watcher) return

  const transcriptPath = getTranscriptPath()
  const dir = getBridgeDir()
  mkdirSync(dir, { recursive: true })

  // Ensure file exists so watch doesn't throw
  if (!existsSync(transcriptPath)) {
    writeFileSync(transcriptPath, '')
  }

  _watcher = watch(dir, (eventType, filename) => {
    if (filename !== 'transcript.txt' || eventType !== 'change') return
    try {
      const text = readFileSync(transcriptPath, 'utf-8').trim()
      if (!text) return
      // Clear the file immediately to avoid re-reads
      writeFileSync(transcriptPath, '')
      // Send to renderer
      const wc = _getWebContents?.()
      if (wc) wc.send('voice:transcript', text)
      console.log('[voice] Transcript received:', text.slice(0, 80))
    } catch {}
  })
}

function stopTranscriptWatcher(): void {
  _watcher?.close()
  _watcher = null
}

// ---------------------------------------------------------------------------
// Toggle transcription — shell out to Handy CLI
// ---------------------------------------------------------------------------

function toggleTranscription(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isHandyInstalled()) {
      reject(new Error('Handy is not installed'))
      return
    }
    execFile(HANDY_CLI, ['--toggle-transcription'], (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerVoiceHandlers(getWebContents: () => WebContents | null): void {
  _getWebContents = getWebContents

  ipcMain.handle('voice:checkHandy', () => isHandyInstalled())

  ipcMain.handle('voice:installHandy', async () => {
    await installHandy()
    // After install, set up the bridge
    ensureBridgeScript()
    startTranscriptWatcher()
  })

  ipcMain.handle('voice:setup', () => {
    ensureBridgeScript()
    startTranscriptWatcher()
    return { bridgeScriptPath: getBridgeScriptPath() }
  })

  ipcMain.handle('voice:toggle', async () => {
    await toggleTranscription()
  })

  // Initialize bridge on startup if Handy is installed
  if (isHandyInstalled()) {
    ensureBridgeScript()
    startTranscriptWatcher()
  }
}
