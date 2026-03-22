import { describe, expect, it } from 'vitest'
import {
  beginBrowserFreeze,
  createBrowserSnapshotHandoff,
  resolveBrowserFreeze,
  setBrowserSnapshot,
  showBrowserLive,
} from '../renderer/src/utils/browserSnapshotHandoff'

describe('browserSnapshotHandoff', () => {
  it('starts freezing immediately when an existing screenshot is available', () => {
    const state = setBrowserSnapshot(createBrowserSnapshotHandoff(), 'data:image/png;base64,ready')

    const transition = beginBrowserFreeze(state)

    expect(transition.shouldCaptureAndHide).toBe(true)
    expect(transition.requestId).toBe(1)
    expect(transition.next.handoffState).toBe('freezing')
    expect(transition.next.screenshotVisible).toBe(true)
  })

  it('keeps the live view when no screenshot exists yet', () => {
    const transition = beginBrowserFreeze(createBrowserSnapshotHandoff())

    expect(transition.shouldCaptureAndHide).toBe(false)
    expect(transition.requestId).toBeNull()
    expect(transition.next.handoffState).toBe('live')
    expect(transition.next.screenshotVisible).toBe(false)
  })

  it('falls back to live when capture-and-hide fails', () => {
    const initial = setBrowserSnapshot(createBrowserSnapshotHandoff(), 'data:image/png;base64,last-good')
    const transition = beginBrowserFreeze(initial)

    const next = resolveBrowserFreeze(transition.next, transition.requestId!, {
      dataUrl: null,
      didHide: false,
    })

    expect(next.handoffState).toBe('live')
    expect(next.screenshot).toBe('data:image/png;base64,last-good')
    expect(next.screenshotVisible).toBe(true)
  })

  it('ignores older freeze completions after the live view has been shown again', () => {
    const initial = setBrowserSnapshot(createBrowserSnapshotHandoff(), 'data:image/png;base64,initial')
    const first = beginBrowserFreeze(initial)
    const resumed = showBrowserLive(first.next)
    const second = beginBrowserFreeze(resumed)

    const stale = resolveBrowserFreeze(second.next, first.requestId!, {
      dataUrl: 'data:image/png;base64,stale',
      didHide: true,
    })
    const finalState = resolveBrowserFreeze(stale, second.requestId!, {
      dataUrl: 'data:image/png;base64,fresh',
      didHide: true,
    })

    expect(stale).toBe(second.next)
    expect(finalState.handoffState).toBe('frozen')
    expect(finalState.screenshot).toBe('data:image/png;base64,fresh')
    expect(finalState.screenshotVisible).toBe(true)
  })

  it('keeps the existing screenshot during a successful freeze so movement does not resize it', () => {
    const initial = setBrowserSnapshot(createBrowserSnapshotHandoff(), 'data:image/png;base64,stable')
    const transition = beginBrowserFreeze(initial)

    const next = resolveBrowserFreeze(transition.next, transition.requestId!, {
      dataUrl: 'data:image/png;base64,new-clipped-frame',
      didHide: true,
    })

    expect(next.handoffState).toBe('frozen')
    expect(next.screenshot).toBe('data:image/png;base64,stable')
    expect(next.screenshotVisible).toBe(true)
  })
})
