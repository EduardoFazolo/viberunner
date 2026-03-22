/**
 * canvasLayout.test.ts
 *
 * Invariants this file enforces:
 *
 *   1. The sidebar / title bar / tab bar are NEVER shifted or overwritten by
 *      any camera operation — no matter how extreme.
 *   2. BrowserNodeV2 bounds (the native WebContentsView rectangle) always
 *      stay within the canvas area: left >= vpLeft, top >= vpTop,
 *      width > 0, height > 0 — or the node is null (off-screen).
 *   3. canvasViewportStore is never mutated by camera changes.
 *   4. computeFitCamera works against the real canvas dimensions (sidebar
 *      excluded), not the full viewport.
 *   5. zoomAt anchor invariant holds at every zoom level including the
 *      clamped boundaries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCameraStore, worldToScreen, screenToWorld } from '../renderer/src/stores/cameraStore'
import { useCanvasViewportStore } from '../renderer/src/stores/canvasViewportStore'
import { computeFitCamera } from '../renderer/src/utils/canvasUtils'
import type { NodeRect } from '../renderer/src/utils/canvasUtils'

// ─── Layout constants (must match App / BrowserNodeV2) ───────────────────────

const SIDEBAR_W  = 235
const TITLEBAR_H = 40
const TABBAR_H   = 28
const VP_TOP     = TITLEBAR_H + TABBAR_H   // 68 — canvas starts here vertically
const TITLE_H    = 32                       // BrowserNodeV2 node title bar
const TOOLBAR_H  = 36                       // BrowserNodeV2 URL / toolbar strip

// Typical 1440×900 screen with sidebar open
const SCREEN_W   = 1440
const SCREEN_H   = 900
const CANVAS_W   = SCREEN_W - SIDEBAR_W    // 1205
const CANVAS_H   = SCREEN_H - VP_TOP       // 832

// ─── Pure re-implementation of BrowserNodeV2.getBoundsDirect ─────────────────
//
// We extract the logic so we can hammer it with unit tests without mounting
// a React component. The implementation must stay in sync with BrowserNodeV2.tsx.

interface NodeGeom { x: number; y: number; width: number; height: number }
interface BrowserBounds { x: number; y: number; width: number; height: number }

function calcBrowserBounds(
  camera: { x: number; y: number; zoom: number },
  node: NodeGeom,
  vpLeft: number,
  vpTop: number,
): BrowserBounds | null {
  const { zoom } = camera
  const sx          = vpLeft + camera.x + node.x * zoom
  const syFull      = vpTop  + camera.y + node.y * zoom
  const contentOffY = (TITLE_H + TOOLBAR_H) * zoom
  const sy          = syFull + contentOffY
  const sw          = node.width  * zoom
  const sh          = (node.height - TITLE_H - TOOLBAR_H) * zoom

  const left   = Math.max(sx, vpLeft)
  const top    = Math.max(sy, vpTop)
  const right  = sx + sw
  const bottom = sy + sh

  if (right <= left || bottom <= top) return null
  if (right - left < 0.5 || bottom - top < 0.5) return null

  return {
    x:      Math.round(left),
    y:      Math.round(top),
    width:  Math.round(right - left),
    height: Math.round(bottom - top),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeGeom & { minimized?: boolean }> = {}): NodeGeom & { minimized: boolean } {
  return { x: 0, y: 0, width: 800, height: 500, minimized: false, ...overrides }
}

function nodeMap(nodes: (NodeGeom & { minimized?: boolean })[]): Map<string, NodeRect> {
  return new Map(nodes.map((n, i) => [String(i), { ...n, minimized: n.minimized ?? false }]))
}

// ─── Viewport store helpers ───────────────────────────────────────────────────

function setViewport(left = SIDEBAR_W, top = VP_TOP) {
  useCanvasViewportStore.setState({ left, top })
}

// ─── Camera helpers ───────────────────────────────────────────────────────────

function resetCamera(x = 0, y = 0, zoom = 1) {
  useCameraStore.setState({ camera: { x, y, zoom } })
}

// =============================================================================
// 1. BrowserNodeV2 — bounds invariants
// =============================================================================

describe('BrowserNodeV2 getBoundsDirect — sidebar / canvas boundary invariants', () => {
  const node = makeNode({ x: 300, y: 200, width: 800, height: 500 })
  const vpLeft = SIDEBAR_W
  const vpTop  = VP_TOP

  it('left is always >= vpLeft (browser view never enters the sidebar)', () => {
    const cameras = [
      { x: 0,      y: 0,    zoom: 1    },
      { x: -9999,  y: 0,    zoom: 1    },  // panned hard left
      { x: 9999,   y: 0,    zoom: 1    },  // panned hard right
      { x: -9999,  y: -9999, zoom: 0.05 }, // min zoom, far corner
      { x: 0,      y: 0,    zoom: 5    },  // max zoom
      { x: -50000, y: -50000, zoom: 0.05 }, // absolutely degenerate
    ]
    for (const cam of cameras) {
      const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
      }
    }
  })

  it('top is always >= vpTop (browser view never overlaps title/tab bars)', () => {
    const cameras = [
      { x: 0, y: -9999, zoom: 1    },
      { x: 0, y: 9999,  zoom: 1    },
      { x: 0, y: 0,     zoom: 0.05 },
      { x: 0, y: 0,     zoom: 5    },
    ]
    for (const cam of cameras) {
      const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
      if (bounds) {
        expect(bounds.y).toBeGreaterThanOrEqual(vpTop)
      }
    }
  })

  it('width is always positive when bounds are returned', () => {
    for (let cameraX = -2000; cameraX <= 2000; cameraX += 500) {
      for (const zoom of [0.05, 0.1, 0.5, 1, 2, 5]) {
        const cam = { x: cameraX, y: 0, zoom }
        const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
        if (bounds) expect(bounds.width).toBeGreaterThan(0)
      }
    }
  })

  it('height is always positive when bounds are returned', () => {
    for (let cameraY = -2000; cameraY <= 2000; cameraY += 500) {
      for (const zoom of [0.05, 0.1, 0.5, 1, 2, 5]) {
        const cam = { x: 0, y: cameraY, zoom }
        const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
        if (bounds) expect(bounds.height).toBeGreaterThan(0)
      }
    }
  })

  it('returns null when node is fully behind the sidebar (not a crash-triggering negative width)', () => {
    // Node positioned so its right edge is still left of the sidebar right edge
    const tinyNode = makeNode({ x: -1000, y: 200, width: 50, height: 200 })
    const cam = { x: 0, y: 0, zoom: 1 }
    const bounds = calcBrowserBounds(cam, tinyNode, vpLeft, vpTop)
    expect(bounds).toBeNull()
  })

  it('returns null when node is fully above the canvas top edge', () => {
    const aboveNode = makeNode({ x: 300, y: -2000, width: 800, height: 200 })
    const cam = { x: 0, y: 0, zoom: 1 }
    const bounds = calcBrowserBounds(cam, aboveNode, vpLeft, vpTop)
    expect(bounds).toBeNull()
  })

  it('partial clip — node half-behind sidebar still returns valid positive-width bounds', () => {
    // node starts 100px to the left of the sidebar right edge at zoom=1
    // sx = vpLeft + 0 + (-100)*1 = vpLeft - 100 → left gets clamped to vpLeft
    const leftNode = makeNode({ x: -100, y: 100, width: 500, height: 300 })
    const cam = { x: 0, y: 0, zoom: 1 }
    const bounds = calcBrowserBounds(cam, leftNode, vpLeft, vpTop)
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBe(vpLeft)
    expect(bounds!.width).toBeGreaterThan(0)
    // Width should be reduced by the clipped amount (≈ 400 after clipping 100px)
    expect(bounds!.width).toBeLessThan(500)
  })

  it('when sidebar closes (vpLeft = 0) left boundary drops to 0', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    const boundsOpen   = calcBrowserBounds(cam, node, SIDEBAR_W, vpTop)
    const boundsClosed = calcBrowserBounds(cam, node, 0, vpTop)
    // Sidebar closed → node can start further left
    expect(boundsClosed!.x).toBeLessThanOrEqual(boundsOpen!.x)
  })

  it('massive pan left + min zoom does not produce negative-width bounds', () => {
    const cam = { x: -1_000_000, y: 0, zoom: 0.05 }
    const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
    // Either null (fully off-screen) or valid positive dims
    if (bounds) {
      expect(bounds.width).toBeGreaterThan(0)
      expect(bounds.height).toBeGreaterThan(0)
      expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
    }
  })

  it('massive pan right + max zoom does not produce out-of-bounds left edge', () => {
    const cam = { x: 1_000_000, y: 0, zoom: 5 }
    const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
      expect(bounds.y).toBeGreaterThanOrEqual(vpTop)
      expect(bounds.width).toBeGreaterThan(0)
      expect(bounds.height).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// 2. canvasViewportStore — never mutated by camera changes
// =============================================================================

describe('canvasViewportStore — isolated from camera mutations', () => {
  beforeEach(() => {
    setViewport()
    resetCamera()
  })

  it('vpLeft stays at SIDEBAR_W after zoom in', () => {
    useCameraStore.getState().zoomAt(600, 400, -500)
    expect(useCanvasViewportStore.getState().left).toBe(SIDEBAR_W)
  })

  it('vpLeft stays at SIDEBAR_W after zoom out to min', () => {
    useCameraStore.getState().zoomAt(600, 400, 1_000_000)
    expect(useCanvasViewportStore.getState().left).toBe(SIDEBAR_W)
  })

  it('vpTop stays at VP_TOP after any pan', () => {
    useCameraStore.getState().pan(-9999, -9999)
    expect(useCanvasViewportStore.getState().top).toBe(VP_TOP)
    useCameraStore.getState().pan(9999, 9999)
    expect(useCanvasViewportStore.getState().top).toBe(VP_TOP)
  })

  it('500 rapid pan+zoom calls do not drift vpLeft or vpTop', () => {
    for (let i = 0; i < 500; i++) {
      useCameraStore.getState().pan((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200)
      useCameraStore.getState().zoomAt(
        Math.random() * SCREEN_W,
        Math.random() * SCREEN_H,
        (Math.random() - 0.5) * 1000,
      )
    }
    expect(useCanvasViewportStore.getState().left).toBe(SIDEBAR_W)
    expect(useCanvasViewportStore.getState().top).toBe(VP_TOP)
  })
})

// =============================================================================
// 3. computeFitCamera — must use canvas dims (sidebar-excluded)
// =============================================================================

describe('computeFitCamera — fits nodes inside the actual canvas area', () => {
  // These tests pass explicit canvas dimensions that exclude the sidebar/bars,
  // the same values that getCanvasRect() now returns via canvasViewportStore.

  it('centers a single node within the canvas area (not full viewport)', () => {
    const node = makeNode({ x: 0, y: 0, width: 400, height: 300 })
    const cam  = computeFitCamera(nodeMap([node]), CANVAS_W, CANVAS_H)!

    const nodeCenterX = node.x + node.width  / 2
    const nodeCenterY = node.y + node.height / 2
    const screenCenter = worldToScreen(nodeCenterX, nodeCenterY, cam)

    // Center of canvas area (not center of full 1440×900 screen)
    expect(screenCenter.x).toBeCloseTo(CANVAS_W / 2, 0)
    expect(screenCenter.y).toBeCloseTo(CANVAS_H / 2, 0)
  })

  it('all nodes are visible after fit when using canvas dims', () => {
    const nodes = [
      makeNode({ x: -500, y: -300, width: 200, height: 150 }),
      makeNode({ x:  800, y:  600, width: 200, height: 150 }),
      makeNode({ x:  200, y:  100, width: 400, height: 300 }),
    ]
    const cam = computeFitCamera(nodeMap(nodes), CANVAS_W, CANVAS_H)!

    for (const n of nodes) {
      const tl = worldToScreen(n.x,           n.y,            cam)
      const br = worldToScreen(n.x + n.width,  n.y + n.height, cam)
      expect(tl.x).toBeGreaterThanOrEqual(-1)   // allow 1px rounding
      expect(tl.y).toBeGreaterThanOrEqual(-1)
      expect(br.x).toBeLessThanOrEqual(CANVAS_W + 1)
      expect(br.y).toBeLessThanOrEqual(CANVAS_H + 1)
    }
  })

  it('fit using full viewport (wrong) shifts center vs fit using canvas dims (correct)', () => {
    const node = makeNode({ x: 0, y: 0, width: 400, height: 300 })

    const camFull   = computeFitCamera(nodeMap([node]), SCREEN_W, SCREEN_H)!
    const camCanvas = computeFitCamera(nodeMap([node]), CANVAS_W, CANVAS_H)!

    // Camera x must differ — using full viewport incorrectly centers
    // with respect to a 1440px-wide area instead of a 1205px-wide area.
    expect(camFull.x).not.toBeCloseTo(camCanvas.x, 0)
  })

  it('returns null for an empty workspace (no crash)', () => {
    expect(computeFitCamera(new Map(), CANVAS_W, CANVAS_H)).toBeNull()
  })

  it('never produces a zoom < 0 for any node arrangement', () => {
    const extremes = [
      makeNode({ x: -50000, y: -50000, width: 100000, height: 100000 }),
      makeNode({ x: 0,      y: 0,      width: 1,      height: 1 }),
    ]
    for (const n of extremes) {
      const cam = computeFitCamera(nodeMap([n]), CANVAS_W, CANVAS_H)!
      expect(cam.zoom).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// 4. zoomAt — anchor invariant at clamped boundaries
// =============================================================================

describe('zoomAt — screen anchor stays fixed across all zoom levels', () => {
  beforeEach(() => resetCamera())

  it('anchor holds at a normal zoom level', () => {
    const anchor = { x: 400, y: 300 }
    const before = screenToWorld(anchor.x, anchor.y, useCameraStore.getState().camera)
    useCameraStore.getState().zoomAt(anchor.x, anchor.y, -200)
    const after = screenToWorld(anchor.x, anchor.y, useCameraStore.getState().camera)
    expect(after.x).toBeCloseTo(before.x, 4)
    expect(after.y).toBeCloseTo(before.y, 4)
  })

  it('camera x/y do not keep drifting when already at MIN_ZOOM', () => {
    // Zoom out to the floor
    useCameraStore.getState().zoomAt(600, 400, 1_000_000)
    const { x: x1, y: y1 } = useCameraStore.getState().camera

    // Keep trying to zoom out further — camera must not move
    for (let i = 0; i < 20; i++) {
      useCameraStore.getState().zoomAt(600, 400, 10_000)
    }
    const { x: x2, y: y2 } = useCameraStore.getState().camera

    expect(x2).toBeCloseTo(x1, 3)
    expect(y2).toBeCloseTo(y1, 3)
  })

  it('camera x/y do not keep drifting when already at MAX_ZOOM', () => {
    useCameraStore.getState().zoomAt(600, 400, -1_000_000)
    const { x: x1, y: y1 } = useCameraStore.getState().camera

    for (let i = 0; i < 20; i++) {
      useCameraStore.getState().zoomAt(600, 400, -10_000)
    }
    const { x: x2, y: y2 } = useCameraStore.getState().camera

    expect(x2).toBeCloseTo(x1, 3)
    expect(y2).toBeCloseTo(y1, 3)
  })

  it('anchor stays fixed through 100 successive zoom steps', () => {
    const anchor = { x: 700, y: 350 }
    const before = screenToWorld(anchor.x, anchor.y, useCameraStore.getState().camera)

    for (let i = 0; i < 100; i++) {
      useCameraStore.getState().zoomAt(anchor.x, anchor.y, -30)
    }

    const after = screenToWorld(anchor.x, anchor.y, useCameraStore.getState().camera)
    // Allow small floating point accumulation but no visible drift
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
  })

  it('zoom values are never NaN or Infinity', () => {
    const cases = [-1_000_000, -100, -1, 0, 1, 100, 1_000_000]
    for (const delta of cases) {
      resetCamera()
      useCameraStore.getState().zoomAt(600, 400, delta)
      const { zoom, x, y } = useCameraStore.getState().camera
      expect(Number.isFinite(zoom)).toBe(true)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})

// =============================================================================
// 5. BrowserNodeV2 bounds — sidebar animation mid-flight
// =============================================================================

describe('BrowserNodeV2 bounds — sidebar open/close animation frames', () => {
  const node   = makeNode({ x: 0, y: 0, width: 800, height: 500 })
  const camera = { x: 0, y: 0, zoom: 1 }

  it('bounds.x tracks vpLeft correctly at each animation frame', () => {
    // Simulate sidebar closing: vpLeft goes from SIDEBAR_W down to 0
    for (let vpLeft = SIDEBAR_W; vpLeft >= 0; vpLeft -= 10) {
      const bounds = calcBrowserBounds(camera, node, vpLeft, VP_TOP)
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
        expect(bounds.width).toBeGreaterThan(0)
      }
    }
  })

  it('partial sidebar hide never exposes a negative-x browser view', () => {
    for (let vpLeft = SIDEBAR_W; vpLeft >= 0; vpLeft -= 23) {
      const bounds = calcBrowserBounds(camera, node, vpLeft, VP_TOP)
      if (bounds) expect(bounds.x).toBeGreaterThanOrEqual(0)
    }
  })

  it('node behind sidebar during animation still returns null or valid bounds', () => {
    // Node placed where it would be fully hidden at full sidebar width
    const hiddenNode = makeNode({ x: -800, y: 100, width: 600, height: 400 })
    for (let vpLeft = SIDEBAR_W; vpLeft >= 0; vpLeft -= 10) {
      const bounds = calcBrowserBounds(camera, hiddenNode, vpLeft, VP_TOP)
      if (bounds) {
        expect(bounds.width).toBeGreaterThan(0)
        expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
      }
    }
  })
})

// =============================================================================
// 6. BrowserNodeV2 bounds — zoom + pan combined stress
// =============================================================================

describe('BrowserNodeV2 bounds — combined zoom and pan stress', () => {
  const node   = makeNode({ x: 200, y: 150, width: 600, height: 400 })
  const vpLeft = SIDEBAR_W
  const vpTop  = VP_TOP

  it('1000 random camera states never produce invalid bounds', () => {
    for (let i = 0; i < 1000; i++) {
      const cam = {
        x:    (Math.random() - 0.5) * 10_000,
        y:    (Math.random() - 0.5) * 10_000,
        zoom: Math.random() * 5 + 0.05,
      }
      const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
      if (bounds !== null) {
        expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
        expect(bounds.y).toBeGreaterThanOrEqual(vpTop)
        expect(bounds.width).toBeGreaterThan(0)
        expect(bounds.height).toBeGreaterThan(0)
        expect(Number.isFinite(bounds.x)).toBe(true)
        expect(Number.isFinite(bounds.y)).toBe(true)
        expect(Number.isFinite(bounds.width)).toBe(true)
        expect(Number.isFinite(bounds.height)).toBe(true)
      }
    }
  })

  it('zoom out to min leaves bounds x >= vpLeft', () => {
    const cam = { x: 0, y: 0, zoom: 0.05 }
    const bounds = calcBrowserBounds(cam, node, vpLeft, vpTop)
    if (bounds) expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
  })

  it('zoom in to max still clips correctly to vpLeft', () => {
    // At zoom=5 with camera.x=0, a node at x=0 starts at vpLeft exactly
    const cam = { x: 0, y: 0, zoom: 5 }
    const leftNode = makeNode({ x: -10, y: 100, width: 200, height: 300 })
    const bounds = calcBrowserBounds(cam, leftNode, vpLeft, vpTop)
    if (bounds) expect(bounds.x).toBeGreaterThanOrEqual(vpLeft)
  })
})
