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
  captureAndHideBrowserView,
  captureBrowserView,
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

  it('captures the live frame before parking the Browser V2 view off-screen', async () => {
    createBrowserView('node-4', 'persist:test', 'https://example.com', {
      x: 280,
      y: 120,
      width: 420,
      height: 260,
    })

    const view = latestView()
    setBrowserViewVisible('node-4', true)
    view.setBounds.mockClear()

    const result = await captureAndHideBrowserView('node-4')

    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,test',
      didHide: true,
    })
    expect(view.webContents.capturePage).toHaveBeenCalledOnce()
    expect(view.setBounds.mock.calls[0]?.[0]).toEqual({
      x: 280,
      y: 120,
      width: 420,
      height: 260,
    })
    expect(latestBounds(view)).toEqual(OFF_SCREEN)
    expect(view.webContents.capturePage.mock.invocationCallOrder[0]).toBeLessThan(
      view.setBounds.mock.invocationCallOrder.at(-1) ?? Infinity
    )
  })

  it('never captures a hidden Browser V2 view from OFF_SCREEN bounds', async () => {
    createBrowserView('node-5', 'persist:test', 'https://example.com', {
      x: 280,
      y: 120,
      width: 420,
      height: 260,
    })

    const view = latestView()
    setBrowserViewVisible('node-5', true)
    setBrowserViewVisible('node-5', false)
    view.webContents.capturePage.mockClear()

    const dataUrl = await captureBrowserView('node-5')

    expect(dataUrl).toBeNull()
    expect(view.webContents.capturePage).not.toHaveBeenCalled()
    expect(latestBounds(view)).toEqual(OFF_SCREEN)
  })

  it('ignores stale late capture results and keeps the newer screenshot cached', async () => {
    createBrowserView('node-6', 'persist:test', 'https://example.com', {
      x: 300,
      y: 140,
      width: 360,
      height: 240,
    })

    const view = latestView()
    setBrowserViewVisible('node-6', true)

    const first = deferred<{ toDataURL: () => string }>()
    const second = deferred<{ toDataURL: () => string }>()
    view.webContents.capturePage
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstCapture = captureBrowserView('node-6')
    const secondCapture = captureBrowserView('node-6')

    second.resolve({ toDataURL: () => 'data:image/png;base64,newer' })
    await expect(secondCapture).resolves.toBe('data:image/png;base64,newer')

    first.resolve({ toDataURL: () => 'data:image/png;base64,older' })
    await expect(firstCapture).resolves.toBe('data:image/png;base64,newer')

    setBrowserViewVisible('node-6', false)
    await expect(captureBrowserView('node-6')).resolves.toBe('data:image/png;base64,newer')
  })

  it('uses the latest cached live bounds for capture-and-hide and restores them on re-show', async () => {
    createBrowserView('node-7', 'persist:test', 'https://example.com', {
      x: 320,
      y: 160,
      width: 400,
      height: 240,
    })

    const view = latestView()
    setBrowserViewVisible('node-7', true)
    updateBrowserViewBounds('node-7', {
      x: 180,
      y: 160,
      width: 400,
      height: 240,
    })

    view.setBounds.mockClear()
    await captureAndHideBrowserView('node-7')

    expect(view.setBounds.mock.calls[0]?.[0]).toEqual({
      x: 240,
      y: 160,
      width: 340,
      height: 240,
    })
    expect(latestBounds(view)).toEqual(OFF_SCREEN)

    view.setBounds.mockClear()
    setBrowserViewVisible('node-7', true)

    expect(latestBounds(view)).toEqual({
      x: 240,
      y: 160,
      width: 340,
      height: 240,
    })
  })
})
