/**
 * Tests for the pure coordinate mapping functions from useMaestro.ts.
 *
 * Since the helper functions (toScreenCoords, palmSize, isPinching) are
 * module-private, we replicate their logic here and verify the key invariants:
 *   - winX/winY must match HandOverlay's rendering: (1 - normX) * vw, normY * vh
 *   - absX/absY correctly adds window offset + title bar
 *   - isPinching uses 3D distance with palm-size-relative threshold
 *   - palmSize is dist(wrist lm0, middle-finger MCP lm9)
 *   - Coordinate mapping is independent of palm size / distance from camera
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Replicated pure functions (must match useMaestro.ts logic exactly) ──────

interface HandLandmark {
  x: number
  y: number
  z: number
}

const PINCH_THRESHOLD = 0.28

function dist2D(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function dist3D(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function palmSize(lms: HandLandmark[]): number {
  return dist2D(lms[0], lms[9])
}

function isPinching(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  return dist3D(lms[4], lms[8]) < ps * PINCH_THRESHOLD
}

function toScreenCoords(
  normX: number,
  normY: number,
  win: { innerWidth: number; innerHeight: number; screenX: number; screenY: number; outerHeight: number },
): { absX: number; absY: number; winX: number; winY: number } {
  const vw = win.innerWidth
  const vh = win.innerHeight
  const winX = (1 - normX) * vw
  const winY = normY * vh
  const titleBarH = win.outerHeight - win.innerHeight
  const absX = win.screenX + winX
  const absY = win.screenY + titleBarH + winY
  return { absX, absY, winX, winY }
}

// ─── Mock window dimensions ──────────────────────────────────────────────────

const MOCK_WIN = {
  innerWidth: 1440,
  innerHeight: 900,
  screenX: 100,
  screenY: 50,
  outerHeight: 928, // title bar = 28px
}

const TITLE_BAR = MOCK_WIN.outerHeight - MOCK_WIN.innerHeight // 28

// ─── Helper: create a minimal 21-landmark hand ──────────────────────────────

function makeHand(overrides: Partial<Record<number, Partial<HandLandmark>>> = {}): HandLandmark[] {
  const base: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  for (const [idx, partial] of Object.entries(overrides)) {
    const i = Number(idx)
    base[i] = { ...base[i], ...partial }
  }
  return base
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('toScreenCoords', () => {
  it('maps center (0.5, 0.5) to center of viewport', () => {
    const { winX, winY } = toScreenCoords(0.5, 0.5, MOCK_WIN)
    expect(winX).toBeCloseTo(720) // (1 - 0.5) * 1440
    expect(winY).toBeCloseTo(450) // 0.5 * 900
  })

  it('maps top-left webcam (0, 0) to top-right of viewport (mirrored)', () => {
    const { winX, winY } = toScreenCoords(0, 0, MOCK_WIN)
    expect(winX).toBeCloseTo(1440) // (1 - 0) * 1440
    expect(winY).toBeCloseTo(0)    // 0 * 900
  })

  it('maps top-right webcam (1, 0) to top-left of viewport (mirrored)', () => {
    const { winX, winY } = toScreenCoords(1, 0, MOCK_WIN)
    expect(winX).toBeCloseTo(0)   // (1 - 1) * 1440
    expect(winY).toBeCloseTo(0)
  })

  it('maps bottom-left webcam (0, 1) to bottom-right of viewport', () => {
    const { winX, winY } = toScreenCoords(0, 1, MOCK_WIN)
    expect(winX).toBeCloseTo(1440)
    expect(winY).toBeCloseTo(900)
  })

  it('maps bottom-right webcam (1, 1) to bottom-left of viewport', () => {
    const { winX, winY } = toScreenCoords(1, 1, MOCK_WIN)
    expect(winX).toBeCloseTo(0)
    expect(winY).toBeCloseTo(900)
  })

  it('maps edges correctly (midpoints)', () => {
    // Top center
    const top = toScreenCoords(0.5, 0, MOCK_WIN)
    expect(top.winX).toBeCloseTo(720)
    expect(top.winY).toBeCloseTo(0)

    // Bottom center
    const bottom = toScreenCoords(0.5, 1, MOCK_WIN)
    expect(bottom.winX).toBeCloseTo(720)
    expect(bottom.winY).toBeCloseTo(900)

    // Left edge (webcam normX=0.25)
    const left = toScreenCoords(0.25, 0.5, MOCK_WIN)
    expect(left.winX).toBeCloseTo(1080) // (1 - 0.25) * 1440
    expect(left.winY).toBeCloseTo(450)
  })

  it('computes absX/absY with window offset and title bar', () => {
    const { absX, absY, winX, winY } = toScreenCoords(0.5, 0.5, MOCK_WIN)
    expect(absX).toBeCloseTo(MOCK_WIN.screenX + winX) // 100 + 720
    expect(absY).toBeCloseTo(MOCK_WIN.screenY + TITLE_BAR + winY) // 50 + 28 + 450
    expect(absX).toBeCloseTo(820)
    expect(absY).toBeCloseTo(528)
  })

  it('absX/absY at top-left corner of viewport', () => {
    const { absX, absY } = toScreenCoords(1, 0, MOCK_WIN)
    expect(absX).toBeCloseTo(100)      // screenX + 0
    expect(absY).toBeCloseTo(50 + 28)  // screenY + titleBar + 0
  })

  it('absX/absY at bottom-right corner of viewport', () => {
    const { absX, absY } = toScreenCoords(0, 1, MOCK_WIN)
    expect(absX).toBeCloseTo(100 + 1440)
    expect(absY).toBeCloseTo(50 + 28 + 900)
  })

  it('handles fractional positions precisely', () => {
    const { winX, winY } = toScreenCoords(0.333, 0.667, MOCK_WIN)
    expect(winX).toBeCloseTo((1 - 0.333) * 1440, 4)
    expect(winY).toBeCloseTo(0.667 * 900, 4)
  })
})

describe('winX/winY matches HandOverlay rendering formula', () => {
  // HandOverlay draws landmarks at:  x = (1 - lm.x) * vw,  y = lm.y * vh
  // toScreenCoords produces:         winX = (1 - normX) * vw,  winY = normY * vh
  // When normX = lm.x and normY = lm.y, they MUST match.

  const testCases = [
    { normX: 0.0, normY: 0.0, label: 'top-right (mirrored)' },
    { normX: 1.0, normY: 0.0, label: 'top-left (mirrored)' },
    { normX: 0.0, normY: 1.0, label: 'bottom-right' },
    { normX: 1.0, normY: 1.0, label: 'bottom-left' },
    { normX: 0.5, normY: 0.5, label: 'center' },
    { normX: 0.123, normY: 0.789, label: 'arbitrary position' },
    { normX: 0.999, normY: 0.001, label: 'near top-left edge' },
  ]

  for (const { normX, normY, label } of testCases) {
    it(`cursor matches hand skeleton at ${label} (${normX}, ${normY})`, () => {
      const vw = MOCK_WIN.innerWidth
      const vh = MOCK_WIN.innerHeight

      // HandOverlay formula
      const overlayX = (1 - normX) * vw
      const overlayY = normY * vh

      // toScreenCoords formula
      const { winX, winY } = toScreenCoords(normX, normY, MOCK_WIN)

      expect(winX).toBeCloseTo(overlayX, 10)
      expect(winY).toBeCloseTo(overlayY, 10)
    })
  }

  it('match holds for any random coordinate pair', () => {
    const vw = MOCK_WIN.innerWidth
    const vh = MOCK_WIN.innerHeight

    for (let i = 0; i < 50; i++) {
      const normX = Math.random()
      const normY = Math.random()

      const overlayX = (1 - normX) * vw
      const overlayY = normY * vh
      const { winX, winY } = toScreenCoords(normX, normY, MOCK_WIN)

      expect(winX).toBeCloseTo(overlayX, 10)
      expect(winY).toBeCloseTo(overlayY, 10)
    }
  })
})

describe('palmSize', () => {
  it('computes 2D distance from wrist (lm0) to middle-finger MCP (lm9)', () => {
    const lms = makeHand({
      0: { x: 0.3, y: 0.5 },
      9: { x: 0.5, y: 0.5 },
    })
    expect(palmSize(lms)).toBeCloseTo(0.2)
  })

  it('handles vertical palm orientation', () => {
    const lms = makeHand({
      0: { x: 0.5, y: 0.3 },
      9: { x: 0.5, y: 0.5 },
    })
    expect(palmSize(lms)).toBeCloseTo(0.2)
  })

  it('handles diagonal palm', () => {
    const lms = makeHand({
      0: { x: 0.0, y: 0.0 },
      9: { x: 0.3, y: 0.4 },
    })
    expect(palmSize(lms)).toBeCloseTo(0.5) // sqrt(0.09 + 0.16)
  })

  it('returns small value for distant hand (small palm)', () => {
    const lms = makeHand({
      0: { x: 0.48, y: 0.50 },
      9: { x: 0.52, y: 0.50 },
    })
    expect(palmSize(lms)).toBeCloseTo(0.04)
  })

  it('returns large value for close hand (large palm)', () => {
    const lms = makeHand({
      0: { x: 0.2, y: 0.3 },
      9: { x: 0.6, y: 0.7 },
    })
    // sqrt(0.16 + 0.16) = sqrt(0.32) ~ 0.566
    expect(palmSize(lms)).toBeCloseTo(Math.sqrt(0.32))
  })

  it('ignores z-coordinate (2D only)', () => {
    const lms = makeHand({
      0: { x: 0.3, y: 0.5, z: 0.0 },
      9: { x: 0.5, y: 0.5, z: 0.9 },
    })
    // Should still be 0.2 (z ignored in palmSize which uses dist2D)
    expect(palmSize(lms)).toBeCloseTo(0.2)
  })

  it('returns zero when wrist and MCP are at same position', () => {
    const lms = makeHand({
      0: { x: 0.5, y: 0.5 },
      9: { x: 0.5, y: 0.5 },
    })
    expect(palmSize(lms)).toBeCloseTo(0)
  })
})

describe('isPinching', () => {
  // isPinching: dist3D(lm4, lm8) < palmSize(lm0, lm9) * 0.28

  function makePinchHand(opts: {
    thumbTip: Partial<HandLandmark>
    indexTip: Partial<HandLandmark>
    wrist?: Partial<HandLandmark>
    middleMCP?: Partial<HandLandmark>
  }): HandLandmark[] {
    return makeHand({
      0: { x: 0.3, y: 0.5, z: 0, ...opts.wrist },         // wrist
      4: { x: 0.5, y: 0.5, z: 0, ...opts.thumbTip },       // thumb tip
      8: { x: 0.5, y: 0.5, z: 0, ...opts.indexTip },        // index tip
      9: { x: 0.5, y: 0.5, z: 0, ...opts.middleMCP },       // middle-finger MCP
    })
  }

  it('returns true when thumb and index tips are touching', () => {
    const lms = makePinchHand({
      thumbTip: { x: 0.45, y: 0.45, z: 0 },
      indexTip: { x: 0.45, y: 0.45, z: 0 },
    })
    expect(isPinching(lms)).toBe(true)
  })

  it('returns true when tips are very close (within threshold)', () => {
    // palmSize = dist2D(lm0, lm9) = dist2D({0.3,0.5}, {0.5,0.5}) = 0.2
    // threshold = 0.2 * 0.28 = 0.056
    // tip distance must be < 0.056
    const lms = makePinchHand({
      thumbTip: { x: 0.44, y: 0.45, z: 0 },
      indexTip: { x: 0.48, y: 0.45, z: 0 },
    })
    // dist3D = sqrt(0.04^2) = 0.04 < 0.056
    expect(isPinching(lms)).toBe(true)
  })

  it('returns false when fingers are clearly apart', () => {
    const lms = makePinchHand({
      thumbTip: { x: 0.3, y: 0.3, z: 0 },
      indexTip: { x: 0.7, y: 0.7, z: 0 },
    })
    expect(isPinching(lms)).toBe(false)
  })

  it('returns false when at threshold boundary (just outside)', () => {
    // palmSize = 0.2, threshold = 0.056
    // Place tips so dist3D is just above 0.056
    const lms = makePinchHand({
      thumbTip: { x: 0.44, y: 0.45, z: 0 },
      indexTip: { x: 0.50, y: 0.45, z: 0 },
    })
    // dist3D = 0.06 > 0.056
    expect(isPinching(lms)).toBe(false)
  })

  it('uses 3D distance (z matters for tilt detection)', () => {
    // Tips close in 2D but far in Z
    // palmSize = 0.2, threshold = 0.056
    const lms = makePinchHand({
      thumbTip: { x: 0.45, y: 0.45, z: 0.0 },
      indexTip: { x: 0.45, y: 0.45, z: 0.1 },
    })
    // dist3D = 0.1 > 0.056
    expect(isPinching(lms)).toBe(false)
  })

  it('returns true when z-close despite slight xy offset', () => {
    // palmSize = 0.2, threshold = 0.056
    const lms = makePinchHand({
      thumbTip: { x: 0.45, y: 0.45, z: 0.01 },
      indexTip: { x: 0.47, y: 0.45, z: 0.01 },
    })
    // dist3D = sqrt(0.02^2) = 0.02 < 0.056
    expect(isPinching(lms)).toBe(true)
  })

  it('returns false when palm is too small (< 0.01)', () => {
    const lms = makePinchHand({
      wrist:    { x: 0.500, y: 0.500 },
      middleMCP: { x: 0.505, y: 0.500 },
      thumbTip: { x: 0.45, y: 0.45, z: 0 },
      indexTip: { x: 0.45, y: 0.45, z: 0 },
    })
    // palmSize = 0.005 < 0.01 -> returns false
    expect(isPinching(lms)).toBe(false)
  })

  it('pinch threshold scales with palm size (large hand)', () => {
    // Large palm: palmSize = dist(0.1, 0.5) to (0.7, 0.5) = 0.6
    // threshold = 0.6 * 0.28 = 0.168
    const lms = makePinchHand({
      wrist:    { x: 0.1, y: 0.5 },
      middleMCP: { x: 0.7, y: 0.5 },
      thumbTip: { x: 0.45, y: 0.45, z: 0 },
      indexTip: { x: 0.55, y: 0.55, z: 0 },
    })
    // dist3D = sqrt(0.1^2 + 0.1^2) ~ 0.1414 < 0.168
    expect(isPinching(lms)).toBe(true)
  })

  it('pinch threshold scales with palm size (small hand)', () => {
    // Small palm: palmSize = 0.06, threshold = 0.06 * 0.28 = 0.0168
    const lms = makePinchHand({
      wrist:    { x: 0.47, y: 0.50 },
      middleMCP: { x: 0.53, y: 0.50 },
      thumbTip: { x: 0.45, y: 0.45, z: 0 },
      indexTip: { x: 0.47, y: 0.45, z: 0 },
    })
    // dist3D = 0.02 > 0.0168
    expect(isPinching(lms)).toBe(false)
  })
})

describe('coordinate mapping is distance-independent', () => {
  // The key property: regardless of palm size (distance from camera),
  // toScreenCoords(fingerX, fingerY) always produces
  //   winX = (1 - fingerX) * vw
  //   winY = fingerY * vh
  // This matches HandOverlay's rendering, so the cursor dot and
  // the hand skeleton are always aligned.

  const palmSizes = [
    { label: 'very far (tiny palm)', wrist: { x: 0.49, y: 0.5 }, mcp: { x: 0.51, y: 0.5 } },
    { label: 'far', wrist: { x: 0.45, y: 0.5 }, mcp: { x: 0.55, y: 0.5 } },
    { label: 'comfortable', wrist: { x: 0.4, y: 0.5 }, mcp: { x: 0.58, y: 0.5 } },
    { label: 'close (big palm)', wrist: { x: 0.3, y: 0.5 }, mcp: { x: 0.7, y: 0.5 } },
    { label: 'very close', wrist: { x: 0.1, y: 0.5 }, mcp: { x: 0.9, y: 0.5 } },
  ]

  const fingerPositions = [
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.3 },
    { x: 0.8, y: 0.9 },
    { x: 0.0, y: 0.0 },
    { x: 1.0, y: 1.0 },
  ]

  for (const ps of palmSizes) {
    for (const fp of fingerPositions) {
      it(`cursor at (${fp.x}, ${fp.y}) matches overlay when ${ps.label}`, () => {
        const vw = MOCK_WIN.innerWidth
        const vh = MOCK_WIN.innerHeight

        // toScreenCoords does NOT depend on palm size — it takes raw normalized coords
        const { winX, winY } = toScreenCoords(fp.x, fp.y, MOCK_WIN)

        // HandOverlay formula
        const overlayX = (1 - fp.x) * vw
        const overlayY = fp.y * vh

        expect(winX).toBeCloseTo(overlayX, 10)
        expect(winY).toBeCloseTo(overlayY, 10)
      })
    }
  }
})
