import { installSignalScript } from './installSignalScript'
import { installFileChangeScript } from './installFileChangeScript'
import { installClaudeHooks } from '../providers/claude/main/installHooks'

export function setupAgenticSignalTools(): void {
  let signalBin = ''
  let fileChangeBin = ''

  try {
    signalBin = installSignalScript()
  } catch (err) {
    console.warn('[agent] Could not install signal script:', err)
  }

  try {
    fileChangeBin = installFileChangeScript()
  } catch (err) {
    console.warn('[agent] Could not install file change script:', err)
  }

  if (!signalBin) return

  try {
    installClaudeHooks(signalBin, fileChangeBin)
  } catch (err) {
    console.warn('[agent] Could not install Claude hooks:', err)
  }
}
