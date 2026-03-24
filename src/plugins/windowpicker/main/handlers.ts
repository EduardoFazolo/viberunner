import { desktopCapturer } from 'electron'
import { execSync, execFileSync } from 'child_process'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { IpcMainLike } from '../../types'

export interface DesktopWindow {
  id: number
  name: string
  owner: string
  pid: number
}

export interface WindowThumbnail {
  id: number
  thumbnail: string
}

// Swift script that uses CGWindowListCopyWindowInfo to get window ID → owner/PID mapping.
// Only needs Screen Recording permission (no Accessibility required).
const SWIFT_WINDOW_INFO = `
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    print("{}")
    exit(0)
}
var map: [String: [String: Any]] = [:]
for w in list {
    guard let id = w[kCGWindowNumber as String] as? Int,
          let owner = w[kCGWindowOwnerName as String] as? String,
          let pid = w[kCGWindowOwnerPID as String] as? Int else { continue }
    let name = w[kCGWindowName as String] as? String ?? ""
    map[String(id)] = ["owner": owner, "pid": pid, "name": name]
}
let data = try! JSONSerialization.data(withJSONObject: map)
print(String(data: data, encoding: .utf8)!)
`

let cacheDir = ''
let binaryPath = ''
let binaryReady = false

function ensureBinary(): string {
  if (binaryReady && existsSync(binaryPath)) return binaryPath

  cacheDir = join(tmpdir(), 'canvaflow-windowpicker')
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })

  const srcPath = join(cacheDir, 'windowinfo.swift')
  binaryPath = join(cacheDir, 'windowinfo')

  writeFileSync(srcPath, SWIFT_WINDOW_INFO)
  try {
    execSync(`swiftc -O -o "${binaryPath}" "${srcPath}" 2>&1`, { timeout: 60000 })
    binaryReady = true
  } catch (err) {
    console.error('[WindowPicker] Swift compilation failed:', err)
    binaryReady = false
  }

  return binaryPath
}

function getWindowInfoMap(): Map<number, { owner: string; pid: number; name: string }> {
  const map = new Map<number, { owner: string; pid: number; name: string }>()
  try {
    const bin = ensureBinary()
    if (!binaryReady) return map

    const output = execFileSync(bin, { encoding: 'utf-8', timeout: 5000 })
    const parsed = JSON.parse(output.trim()) as Record<
      string,
      { owner: string; pid: number; name: string }
    >
    for (const [idStr, info] of Object.entries(parsed)) {
      map.set(parseInt(idStr), info)
    }
  } catch (err) {
    console.error('[WindowPicker] Failed to get window info:', err)
  }
  return map
}

export function registerWindowPickerHandlers(ipc: IpcMainLike): void {
  // Pre-compile Swift binary on startup (in background)
  setTimeout(() => ensureBinary(), 2000)

  // Fast: returns metadata only (no thumbnails), instant response
  ipc.handle('windowpicker:listWindows', async (): Promise<DesktopWindow[]> => {
    const infoMap = getWindowInfoMap()

    const results: DesktopWindow[] = []
    for (const [id, info] of infoMap) {
      if (!info.name && !info.owner) continue
      results.push({
        id,
        name: info.name || 'Untitled',
        owner: info.owner,
        pid: info.pid
      })
    }

    return results
  })

  // Slow: returns thumbnails for all windows in one batch
  ipc.handle('windowpicker:getThumbnails', async (): Promise<WindowThumbnail[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 240 },
      fetchWindowIcons: true
    })

    const results: WindowThumbnail[] = []
    for (const source of sources) {
      const cgWindowId = parseInt(source.id.split(':')[1])
      if (isNaN(cgWindowId)) continue
      if (source.thumbnail.isEmpty()) continue
      results.push({
        id: cgWindowId,
        thumbnail: source.thumbnail.toDataURL()
      })
    }
    return results
  })

  ipc.handle(
    'windowpicker:captureWindow',
    async (_event: unknown, windowId: number): Promise<string | null> => {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1200, height: 900 }
      })
      const source = sources.find((s) => parseInt(s.id.split(':')[1]) === windowId)
      if (!source || source.thumbnail.isEmpty()) return null
      return source.thumbnail.toDataURL()
    }
  )

  ipc.handle(
    'windowpicker:focusWindow',
    async (_event: unknown, pid: number, owner: string): Promise<void> => {
      try {
        if (pid > 0) {
          execSync(
            `osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true'`,
            { timeout: 3000 }
          )
        } else if (owner) {
          const safeOwner = owner.replace(/["\\]/g, '')
          execSync(`osascript -e 'tell application "${safeOwner}" to activate'`, {
            timeout: 3000
          })
        }
      } catch {
        // Window may have been closed or process ended
      }
    }
  )
}
