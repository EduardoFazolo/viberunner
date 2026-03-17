const pasteFns = new Map<string, (text: string) => Promise<boolean>>()

export function registerBrowserPaster(nodeId: string, paste: (text: string) => Promise<boolean>): void {
  pasteFns.set(nodeId, paste)
}

export function unregisterBrowserPaster(nodeId: string): void {
  pasteFns.delete(nodeId)
}

export async function pasteIntoBrowser(nodeId: string, text: string): Promise<boolean> {
  const paste = pasteFns.get(nodeId)
  if (!paste) return false
  return paste(text)
}
