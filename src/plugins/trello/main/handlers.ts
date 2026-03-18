import { ipcMain, session } from 'electron'
import { buildTrelloExport } from '../utils/trelloExport'
import * as path from 'path'
import type { IpcMainLike } from '../../types'

const TRELLO_API = 'https://api.trello.com/1'
const TRELLO_ORIGIN = 'https://trello.com'
const TRELLO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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

export async function fetchTrelloCardWithSession(partition: string, cardId: string): Promise<TrelloCard> {
  const ses = session.fromPartition(partition)
  const cookies = await ses.cookies.get({ url: TRELLO_ORIGIN })
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  if (!cookieHeader) throw new Error('No Trello session cookies — not logged in')

  const res = await ses.fetch(
    `${TRELLO_ORIGIN}/1/cards/${cardId}?checklists=all&fields=name,desc,shortLink,url,labels,due,dueComplete`,
    {
      headers: {
        cookie: cookieHeader,
        'user-agent': TRELLO_UA,
        'x-trello-client-version': '1.0',
      },
      credentials: 'include',
    }
  )
  if (!res.ok) throw new Error(`Trello session API error: ${res.status}`)
  return res.json()
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

  ipc.handle('trello:fetchCardWithSession', async (
    _e,
    partition: string,
    cardId: string,
  ): Promise<TrelloCard> => {
    return fetchTrelloCardWithSession(partition, cardId)
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
