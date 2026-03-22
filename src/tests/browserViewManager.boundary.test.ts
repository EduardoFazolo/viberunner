/**
 * Browser V2 native-view boundary stress cases.
 *
 * These cases are intentionally aimed at the ugly transitions the UI keeps
 * breaking on:
 *
 * 1. A Browser V2 node drifting under the left nav.
 * 2. Hidden/off-canvas Browser V2 bounds being restored after canvas/tab/workspace
 *    visibility changes.
 * 3. The sidebar boundary changing while a Browser V2 native view is already
 *    visible.
 *
 * The third case currently exposes the bug we want: changing `canvasLeft`
 * does not immediately re-clip already-visible native browser views.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const createdViews: MockWebContentsView[] = []

  class MockWebContentsView {
    public setBounds = vi.fn()
    public setVisible = vi.fn()
    public webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
      setZoomFactor: vi.fn(),
      navigationHistory: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
      },
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      focus: vi.fn(),
      capturePage: vi.fn(async () => ({ toDataURL: () => 'data:image/png;base64,test' })),
      executeJavaScript: vi.fn(),
      getURL: vi.fn(() => 'https://example.com'),
    }

    constructor(_options: unknown) {
      createdViews.push(this)
    }
  }

  const mainWindow = {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    webContents: {
      send: vi.fn(),
    },
    getContentBounds: vi.fn(() => ({ x: 0, y: 0, width: 1440, height: 900 })),
  }

  return {
    createdViews,
    MockWebContentsView,
    BrowserWindow: {
      getAllWindows: vi.fn(() => [mainWindow]),
    },
    session: {
      fromPartition: vi.fn(() => ({})),
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    mainWindow,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
  WebContentsView: electronMocks.MockWebContentsView,
  session: electronMocks.session,
  ipcMain: electronMocks.ipcMain,
}))

vi.mock('../main/browserSession', () => ({
  setupBrowserSession: vi.fn(),
}))

import {
  createBrowserView,
  destroyAllBrowserViews,
  setBrowserViewVisible,
  setCanvasActive,
  setCanvasLeft,
  updateBrowserViewBounds,
} from '../main/browserViewManager'

const OFF_SCREEN = { x: 99999, y: 99999, width: 1, height: 1 }

function latestView(): InstanceType<typeof electronMocks.MockWebContentsView> {
  const view = electronMocks.createdViews.at(-1)
  if (!view) throw new Error('Expected a Browser V2 view to be created')
  return view
}

function latestBounds(view: InstanceType<typeof electronMocks.MockWebContentsView>) {
  const call = view.setBounds.mock.calls.at(-1)
  if (!call) throw new Error('Expected setBounds to be called')
  return call[0]
}

beforeEach(() => {
  destroyAllBrowserViews()
  electronMocks.createdViews.length = 0
  vi.clearAllMocks()
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([electronMocks.mainWindow])
  electronMocks.mainWindow.getContentBounds.mockReturnValue({ x: 0, y: 0, width: 1440, height: 900 })
  setCanvasActive(true)
  setCanvasLeft(240)
})

describe('browserViewManager boundary stress', () => {
  it('clips a Browser V2 view that would otherwise sit behind the left nav', () => {
    createBrowserView('node-1', 'persist:test', 'https://example.com', {
      x: 120,
      y: 80,
      width: 500,
      height: 300,
    })

    const view = latestView()
    setBrowserViewVisible('node-1', true)
    updateBrowserViewBounds('node-1', {
      x: 120,
      y: 80,
      width: 500,
      height: 300,
    })

    expect(latestBounds(view)).toEqual({
      x: 240,
      y: 80,
      width: 380,
      height: 300,
    })
  })

  it('restores the latest clipped bounds after the canvas is hidden and shown again', () => {
    createBrowserView('node-2', 'persist:test', 'https://example.com', {
      x: 260,
      y: 100,
      width: 480,
      height: 320,
    })

    const view = latestView()
    setBrowserViewVisible('node-2', true)
    setCanvasActive(false)
    expect(latestBounds(view)).toEqual(OFF_SCREEN)

    updateBrowserViewBounds('node-2', {
      x: 100,
      y: 100,
      width: 480,
      height: 320,
    })
    setCanvasActive(true)

    expect(latestBounds(view)).toEqual({
      x: 240,
      y: 100,
      width: 340,
      height: 320,
    })
  })

  it('re-clips an already-visible Browser V2 view the moment the sidebar boundary moves right', () => {
    setCanvasLeft(0)
    createBrowserView('node-3', 'persist:test', 'https://example.com', {
      x: 0,
      y: 90,
      width: 520,
      height: 300,
    })

    const view = latestView()
    setBrowserViewVisible('node-3', true)
    expect(latestBounds(view)).toEqual({
      x: 0,
      y: 90,
      width: 520,
      height: 300,
    })

    view.setBounds.mockClear()
    setCanvasLeft(240)

    expect(view.setBounds).toHaveBeenCalledOnce()
    expect(latestBounds(view)).toEqual({
      x: 240,
      y: 90,
      width: 280,
      height: 300,
    })
  })
})
