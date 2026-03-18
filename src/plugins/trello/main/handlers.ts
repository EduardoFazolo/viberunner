import { ipcMain } from 'electron'
import { buildTrelloExport } from '../utils/trelloExport'
import * as path from 'path'
import type { IpcMainLike } from '../../types'

const TRELLO_API = 'https://api.trello.com/1'

export interface TrelloCard {
  id: string
  name: string
  desc: string
  shortLink: string
  url: string
  labels: Array<{ id: string; name: string; color: string }>
  checklists: Array<{
    id: string
    name: string
    checkItems: Array<{ id: string; name: string; state: 'complete' | 'incomplete' }>
  }>
  due: string | null
}

export async function fetchTrelloCard(apiKey: string, token: string, cardId: string): Promise<TrelloCard> {
  const params = new URLSearchParams({
    key: apiKey,
    token,
    fields: 'name,desc,shortLink,url,labels,due',
    checklists: 'all',
    checklist_fields: 'name,checkItems',
  })
  const res = await fetch(`${TRELLO_API}/cards/${cardId}?${params}`)
  if (!res.ok) throw new Error(`Trello API error: ${res.status}`)
  return res.json()
}

export function registerTrelloHandlers(ipc: IpcMainLike): void {
  ipc.handle('app:trelloPreloadPath', () => {
    const filePath = path.join(__dirname, '../preload/trelloWebview.js')
    return `file://${filePath}`
  })

  ipc.handle('trello:fetchCard', async (
    _e,
    apiKey: string,
    token: string,
    cardId: string,
  ): Promise<TrelloCard> => {
    return fetchTrelloCard(apiKey, token, cardId)
  })

  ipc.handle('trello:prepareExport', async (
    _e,
    apiKey: string,
    token: string,
    cardId: string,
  ): Promise<{ text: string; markdown: string }> => {
    const card = await fetchTrelloCard(apiKey, token, cardId)
    return buildTrelloExport(card)
  })
}
