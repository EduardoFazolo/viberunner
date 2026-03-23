export function logAgentDebug(scope: string, event: string, data?: Record<string, unknown>): void {
  const stamp = new Date().toISOString()
  if (data && Object.keys(data).length > 0) {
    console.log(`[agent-debug][${stamp}][${scope}] ${event}`, data)
  } else {
    console.log(`[agent-debug][${stamp}][${scope}] ${event}`)
  }
}

export function summarizeText(text: string, max = 200): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= max) return singleLine
  return `${singleLine.slice(0, max)}...`
}
