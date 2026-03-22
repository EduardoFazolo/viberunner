const START_EVENT = 'canvaflow:canvas-interaction-start'
const END_EVENT = 'canvaflow:canvas-interaction-end'

export function notifyCanvasInteractionStart(): void {
  window.dispatchEvent(new Event(START_EVENT))
}

export function notifyCanvasInteractionEnd(): void {
  window.dispatchEvent(new Event(END_EVENT))
}

export function onCanvasInteractionStart(callback: () => void): () => void {
  const listener = () => callback()
  window.addEventListener(START_EVENT, listener)
  return () => window.removeEventListener(START_EVENT, listener)
}

export function onCanvasInteractionEnd(callback: () => void): () => void {
  const listener = () => callback()
  window.addEventListener(END_EVENT, listener)
  return () => window.removeEventListener(END_EVENT, listener)
}
