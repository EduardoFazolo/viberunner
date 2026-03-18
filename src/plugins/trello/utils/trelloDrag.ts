import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { trelloCardToTiptap } from './trelloToTiptap'
import type { TrelloCard } from '../main/handlers'

export interface TrelloCanvasDropPayload {
  cardId: string
  title: string
}

type PreparedExport = { text: string; markdown: string }

const exportPromiseCache = new Map<string, Promise<PreparedExport>>()
const exportValueCache = new Map<string, PreparedExport>()

export function getPreparedTrelloExport(cardId: string): PreparedExport | null {
  return exportValueCache.get(cardId) ?? null
}

export function primeTrelloExport(
  apiKey: string,
  token: string,
  cardId: string,
): Promise<PreparedExport> {
  const existing = exportValueCache.get(cardId)
  if (existing) return Promise.resolve(existing)
  const existingPromise = exportPromiseCache.get(cardId)
  if (existingPromise) return existingPromise

  const promise = window.trello.prepareExport(apiKey, token, cardId)
    .then((result) => {
      exportValueCache.set(cardId, result)
      return result
    })
    .finally(() => {
      exportPromiseCache.delete(cardId)
    })

  exportPromiseCache.set(cardId, promise)
  return promise
}

export async function createTrelloNoteFromDrop(
  payload: TrelloCanvasDropPayload,
  clientX: number,
  clientY: number,
  prefetchedCard?: TrelloCard | null,
  apiKey?: string,
  token?: string,
  partition?: string,
): Promise<void> {
  const canvasEl = document.querySelector('[data-canvas-root]')
  const canvasRect = canvasEl?.getBoundingClientRect()
  if (!canvasRect) return

  const camera = useCameraStore.getState().camera
  const wx = (clientX - canvasRect.left - camera.x) / camera.zoom
  const wy = (clientY - canvasRect.top - camera.y) / camera.zoom

  const newNode = useNodeStore.getState().add('note', wx - 150, wy - 100, {
    content: null,
    showToolbar: false,
  })
  useNodeStore.getState().update(newNode.id, { title: payload.title })

  try {
    let card: TrelloCard | null = prefetchedCard ?? null
    if (!card && apiKey && token) {
      card = await window.trello.fetchCard(apiKey, token, payload.cardId)
    }
    if (!card && partition) {
      card = await window.trello.fetchCardWithSession(partition, payload.cardId)
    }
    if (!card) {
      const current = useNodeStore.getState().nodes.get(newNode.id)
      if (!current) return
      useNodeStore.getState().update(newNode.id, {
        props: {
          ...current.props,
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: payload.title }] },
            ],
          },
        },
      })
      return
    }

    const tiptap = trelloCardToTiptap(card)
    const current = useNodeStore.getState().nodes.get(newNode.id)
    if (!current) return
    useNodeStore.getState().update(newNode.id, {
      props: { ...current.props, content: tiptap },
    })
  } catch (err) {
    console.error('[createTrelloNoteFromDrop] failed:', err)
  }
}
