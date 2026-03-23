import { installSignalScript } from './installSignalScript'
import { installClaudeHooks } from '../providers/claude/main/installHooks'

export function setupAgenticSignalTools(): void {
  let signalBin = ''

  try {
    signalBin = installSignalScript()
  } catch (err) {
    console.warn('[agent] Could not install signal script:', err)
  }

  if (!signalBin) return

  try {
    installClaudeHooks(signalBin)
  } catch (err) {
    console.warn('[agent] Could not install Claude hooks:', err)
  }
}
