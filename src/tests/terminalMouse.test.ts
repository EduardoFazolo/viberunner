import { describe, expect, it } from 'vitest'
import { normalizeClientPointForMetrics } from '../renderer/src/utils/terminalMouse'

describe('normalizeClientPointForMetrics', () => {
  it('keeps coordinates unchanged when the element is unscaled', () => {
    expect(normalizeClientPointForMetrics(
      { clientX: 250, clientY: 180 },
      { left: 100, top: 80, width: 300, height: 200, clientWidth: 300, clientHeight: 200 },
    )).toEqual({ clientX: 250, clientY: 180 })
  })

  it('maps pointer coordinates back into unscaled space for zoomed-in elements', () => {
    expect(normalizeClientPointForMetrics(
      { clientX: 250, clientY: 210 },
      { left: 100, top: 50, width: 600, height: 400, clientWidth: 300, clientHeight: 200 },
    )).toEqual({ clientX: 175, clientY: 130 })
  })

  it('maps pointer coordinates back into unscaled space for zoomed-out elements', () => {
    expect(normalizeClientPointForMetrics(
      { clientX: 190, clientY: 120 },
      { left: 100, top: 50, width: 150, height: 100, clientWidth: 300, clientHeight: 200 },
    )).toEqual({ clientX: 280, clientY: 190 })
  })

  it('falls back safely when client dimensions are unavailable', () => {
    expect(normalizeClientPointForMetrics(
      { clientX: 250, clientY: 180 },
      { left: 100, top: 80, width: 300, height: 200, clientWidth: 0, clientHeight: 0 },
    )).toEqual({ clientX: 250, clientY: 180 })
  })
})
