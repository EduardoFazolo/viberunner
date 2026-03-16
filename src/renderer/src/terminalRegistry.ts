/**
 * Module-level registry of active terminal serialize functions.
 * Used by beforeunload to capture state from all live terminal nodes
 * without needing to go through React component lifecycle.
 */
const serializeFns = new Map<string, () => string>()

export function registerTerminal(nodeId: string, serialize: () => string): void {
  serializeFns.set(nodeId, serialize)
}

export function unregisterTerminal(nodeId: string): void {
  serializeFns.delete(nodeId)
}

export function serializeAllTerminals(): Map<string, string> {
  const result = new Map<string, string>()
  for (const [nodeId, serialize] of serializeFns) {
    try {
      result.set(nodeId, serialize())
    } catch {
      // terminal may have been disposed already
    }
  }
  return result
}
