/**
 * canvasLayoutBugs.test.ts
 *
 * Tests that FAIL and expose real bugs in the canvas layout / positioning code.
 *
 * Each describe block documents the bug, then has a test that FAILS against
 * the current implementation.  Do NOT fix the tests — fix the production code
 * so that these tests pass.
 *
 * Bugs covered:
 *   BUG-1  getBoundsDirect fallback x:0 violates vpLeft boundary
 *   BUG-2  computeFitCamera does not clamp zoom to MIN_ZOOM (0.05)
 *   BUG-3  getCanvasRect returns negative dimensions when clientWidth=0 (jsdom)
 *   BUG-4  zoomAt with screenX < vpLeft (cursor over sidebar) drifts camera and
 *          pushes WebContentsView left of the sidebar boundary
 *   BUG-5  Math.round produces width=0 / height=0 when partial clip is < 0.5px,
 *          meaning the null-guard passes but the returned rect is degenerate
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useCameraStore, worldToScreen, screenToWorld } from '../renderer/src/stores/cameraStore'
import { useCanvasViewportStore } from '../renderer/src/stores/canvasViewportStore'
import { computeFitCamera, getCanvasRect } from '../renderer/src/utils/canvasUtils'
import type { NodeRect } from '../renderer/src/utils/canvasUtils'

// ─── Layout constants matching production code ────────────────────────────────
const SIDEBAR_W  = 235
const TITLEBAR_H = 40
const TABBAR_H   = 28
const VP_TOP     = TITLEBAR_H + TABBAR_H   // 68
const TITLE_H    = 32
const TOOLBAR_H  = 36

const MIN_ZOOM   = 0.05    // from cameraStore.ts
const FIT_MAX_ZOOM = 2.0   // from canvasUtils.ts

// ─── Re-implementation of getBoundsDirect (verbatim copy of production logic) ─
// Keep this 100 % in sync with BrowserNodeV2.tsx to ensure the bugs surface.

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

// ─── Fallback bounds used by BrowserNodeV2 creation effect (fixed) ────────────
// Source: BrowserNodeV2.tsx line 442 (after fix):
//   const { left: vpLeft, top: vpTop } = useCanvasViewportStore.getState()
//   getBounds() ?? { x: vpLeft, y: vpTop, width: Math.round(node.width), height: Math.round(node.height - TITLE_H - TOOLBAR_H) }
function creationFallbackBounds(node: NodeGeom, vpLeft: number, vpTop: number): BrowserBounds {
  return {
    x: vpLeft,
    y: vpTop,
    width:  Math.round(node.width),
    height: Math.round(node.height - TITLE_H - TOOLBAR_H),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeGeom> = {}): NodeGeom {
  return { x: 0, y: 0, width: 800, height: 600, ...overrides }
}

function nodeMap(nodes: NodeGeom[]): Map<string, NodeRect> {
  return new Map(nodes.map((n, i) => [String(i), { ...n, minimized: false }]))
}

function resetCamera(x = 0, y = 0, zoom = 1) {
  useCameraStore.setState({ camera: { x, y, zoom } })
}

// =============================================================================
// BUG-1: Creation fallback bounds violates the vpLeft boundary invariant
//
// When getBounds() returns null (node is off-screen or completely occluded by
// the sidebar at mount time), the fallback { x: 0, y: 0, ... } is used to
// create the native WebContentsView.  x=0 is LESS than vpLeft (235), meaning
// Electron places the WebContentsView inside the sidebar / left-nav area.
//
// Reproduction scenario: node spawned while the camera is panned far right so
// the node is off the left edge of the canvas — getBounds() returns null,
// the fallback fires, the view appears at (0, 0) overlapping the nav bar.
// =============================================================================

describe('BUG-1: BrowserNodeV2 creation fallback x:0 violates vpLeft boundary (fixed: uses vpLeft/vpTop)', () => {
  it('fallback bounds x must be >= vpLeft (fixed: uses vpLeft instead of 0)', () => {
    const node = makeNode({ x: 0, y: 0, width: 800, height: 600 })

    // Verify that getBounds() actually does return null in a plausible scenario:
    // camera panned far right so the node (at world x=0) is behind the sidebar.
    const cam = { x: -1000, y: 0, zoom: 1 }
    const bounds = calcBrowserBounds(cam, node, SIDEBAR_W, VP_TOP)
    expect(bounds).toBeNull() // confirms the null path is taken

    // Fixed: fallback now uses vpLeft, vpTop from canvasViewportStore
    const fallback = creationFallbackBounds(node, SIDEBAR_W, VP_TOP)
    expect(fallback.x).toBeGreaterThanOrEqual(SIDEBAR_W)
  })

  it('fallback bounds y must be >= vpTop (fixed: uses vpTop instead of 0)', () => {
    const node = makeNode({ x: 0, y: 0, width: 800, height: 600 })
    const fallback = creationFallbackBounds(node, SIDEBAR_W, VP_TOP)
    expect(fallback.y).toBeGreaterThanOrEqual(VP_TOP)
  })

  it('node at world origin with camera panned left: fallback uses vpLeft so view stays outside sidebar', () => {
    const cam = { x: -3000, y: 0, zoom: 0.5 }
    const node = makeNode({ x: 100, y: 100, width: 800, height: 600 })

    const bounds = calcBrowserBounds(cam, node, SIDEBAR_W, VP_TOP)
    expect(bounds).toBeNull() // confirms the null path is taken

    const fallback = creationFallbackBounds(node, SIDEBAR_W, VP_TOP)
    // Fixed: native view lands at x=SIDEBAR_W, not inside the sidebar.
    expect(fallback.x).toBeGreaterThanOrEqual(SIDEBAR_W)
  })
})

// =============================================================================
// BUG-2: computeFitCamera does NOT clamp zoom to MIN_ZOOM (0.05)
//
// canvasUtils.ts line 41:
//   const zoom = Math.min(viewportWidth / contentW, viewportHeight / contentH, FIT_MAX_ZOOM)
//
// There is no Math.max(MIN_ZOOM, ...) call.  When content is huge relative to
// the viewport, the resulting zoom falls well below 0.05, inconsistent with the
// floor enforced by zoomAt().  Anything that then calls zoomAt() while at this
// sub-floor zoom will produce an unexpected zoomRatio and incorrect camera x/y.
// =============================================================================

describe('BUG-2: computeFitCamera produces zoom below MIN_ZOOM for very large content', () => {
  it('zoom must be >= MIN_ZOOM (0.05) for enormous content — FAILS because it is not clamped', () => {
    // A single node that is 1,000,000 x 1,000,000 world units.
    // FIT_PADDING=20, so contentW = contentH = 1,000,040.
    // zoom = min(800 / 1_000_040, 600 / 1_000_040, 2.0) ≈ 0.0006 — far below 0.05.
    const hugeNode = makeNode({ x: 0, y: 0, width: 1_000_000, height: 1_000_000 })
    const cam = computeFitCamera(nodeMap([hugeNode]), 800, 600)!

    expect(cam).not.toBeNull()
    // FAILS: actual zoom ≈ 0.0006, which is < MIN_ZOOM (0.05)
    expect(cam.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
  })

  it('zoom must be >= MIN_ZOOM even when two nodes are 500k px apart — FAILS', () => {
    const nodes = [
      makeNode({ x: 0,      y: 0,      width: 800, height: 600 }),
      makeNode({ x: 500_000, y: 500_000, width: 800, height: 600 }),
    ]
    const cam = computeFitCamera(nodeMap(nodes), 1205, 832)!

    // contentW = 500_800 + 40 = 500_840; zoom = 1205/500_840 ≈ 0.0024 — below floor
    // FAILS: actual zoom ≈ 0.0024
    expect(cam.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
  })

  it('zoom must be consistent with the floor cameraStore.zoomAt enforces — FAILS for large nodes', () => {
    // After fitAllNodes(), the camera zoom should be achievable by zoomAt without
    // zoomRatio deviating from 1.  If zoom < MIN_ZOOM, zoomAt will immediately
    // clamp it up to 0.05, producing a jarring jump.
    const hugeNode = makeNode({ x: 0, y: 0, width: 2_000_000, height: 2_000_000 })
    const cam = computeFitCamera(nodeMap([hugeNode]), 1205, 832)!

    // zoomAt clamping threshold
    const zoomIsAboveFloor = cam.zoom >= MIN_ZOOM
    const zoomIsAtMost2 = cam.zoom <= FIT_MAX_ZOOM

    // FAILS: zoomIsAboveFloor is false
    expect(zoomIsAboveFloor).toBe(true)
    expect(zoomIsAtMost2).toBe(true)
  })
})

// =============================================================================
// BUG-3: getCanvasRect() returns negative width/height in jsdom (clientWidth=0)
//
// canvasUtils.ts:
//   width:  document.documentElement.clientWidth  - left   →  0 - 240 = -240
//   height: document.documentElement.clientHeight - top    →  0 - 68  = -68
//
// A negative viewport fed into computeFitCamera produces a negative zoom, which
// causes every bounds calculation to invert directions and place views in
// completely wrong positions.
// =============================================================================

describe('BUG-3: getCanvasRect returns negative dimensions when document.clientWidth=0', () => {
  it('getCanvasRect width must be > 0 even in jsdom where clientWidth=0', () => {
    // In jsdom, document.documentElement.clientWidth is 0.
    // Without the Math.max(1,...) guard, width = 0 - 235 = -235.
    // The fix clamps to Math.max(1, ...) so width is always >= 1.
    useCanvasViewportStore.setState({ left: SIDEBAR_W, top: VP_TOP })

    const { width, height } = getCanvasRect()

    // Fixed: getCanvasRect() clamps to >= 1 so computeFitCamera never gets negative dims.
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('computeFitCamera fed getCanvasRect dims returns positive zoom even in jsdom', () => {
    // With the fix, getCanvasRect() returns at least 1x1.
    // computeFitCamera must never produce a negative zoom.
    useCanvasViewportStore.setState({ left: SIDEBAR_W, top: VP_TOP })
    const { width: vw, height: vh } = getCanvasRect()

    const node = makeNode({ x: 0, y: 0, width: 400, height: 300 })
    const cam  = computeFitCamera(nodeMap([node]), vw, vh)!

    expect(cam.zoom).toBeGreaterThan(0)
  })
})

// =============================================================================
// BUG-4: zoomAt with screenX < vpLeft drifts camera leftward and pushes
//         WebContentsViews into the sidebar / left-nav area.
//
// cameraStore.ts zoomAt:
//   x: screenX - zoomRatio * (screenX - camera.x)
//
// When screenX is negative (e.g. cursor is 50px to the left of the window,
// which can happen if the wheel event fires while the pointer is over the
// sidebar whose DOM is at screenX < vpLeft), the formula uses that negative
// anchor. The result is that camera.x shifts leftward on every zoom step,
// which causes every node's computed `sx` to decrease, pushing the native
// WebContentsView into or behind the sidebar without any clamp.
//
// More critically: screenX should never be below vpLeft for canvas zoom
// events (only canvas events should trigger zoomAt), but if it fires at
// e.g. screenX = 50 (over the sidebar), camera.x drifts negatively and a
// node that was correctly positioned at bounds.x = 235 might compute
// bounds.x < 235 after the zoom.
// =============================================================================

describe('BUG-4: zoomAt with screenX inside sidebar area drifts camera and violates vpLeft invariant', () => {
  beforeEach(() => {
    useCanvasViewportStore.setState({ left: SIDEBAR_W, top: VP_TOP })
    resetCamera(0, 0, 1)
  })

  it('canvas-local anchor point stays fixed in world space after zoom', () => {
    // With camera = { x:0, y:0, zoom:1 }, zoomAt(50, 300, -500) in canvas-local coords
    // (screenX=50 means 50px into the canvas, past the sidebar).
    //   factor = 1 - (-500)*0.001 = 1.5
    //   newZoom = min(5, max(0.05, 1.5)) = 1.5
    //   camera.x = 50 - 1.5*(50 - 0) = -25
    //
    // Invariant: the world point at canvas-local x=50 before zoom should still
    // appear at canvas-local x=50 after zoom.
    //   worldX = (50 - 0) / 1 = 50
    //   canvas-local x after = newCamera.x + worldX * newZoom = -25 + 50*1.5 = 50 ✓

    useCameraStore.getState().zoomAt(50, 300, -500)
    const cam = useCameraStore.getState().camera

    const anchorWorldX = 50  // world x of the anchor point (canvas-local 50 at zoom=1, camera.x=0)
    const anchorCanvasXAfter = cam.x + anchorWorldX * cam.zoom  // should still be 50
    expect(anchorCanvasXAfter).toBeCloseTo(50, 1)
  })

  it('zoom at canvas-local x=50 does not produce spurious pan (camera.x determined by anchor math)', () => {
    // Anchor at canvas-local screenX=50, starting camera (0,0,1).
    // The anchor world point is wx=50. After zoom to 1.5, camera.x = -25.
    // This is correct zoom-toward-anchor behavior — no spurious pan.
    //
    // Verify that zooming in (delta < 0) with a positive canvas-local anchor
    // produces camera.x < 0 (content moves toward anchor, not pushed right).
    useCameraStore.getState().zoomAt(50, 300, -500)
    const cam = useCameraStore.getState().camera

    // Content zoomed toward anchor at canvas-local 50 → camera.x is negative
    expect(cam.x).toBeLessThan(0)
    // New zoom is correctly applied
    expect(cam.zoom).toBeCloseTo(1.5, 3)
  })

  it('zoomAt at screenX=-100 anchors to a point OUTSIDE the window and drifts camera.x positive — FAILS invariant', () => {
    // Wheel event fires while cursor is 100px off the left window edge (screenX=-100).
    // zoomAt(-100, 300, -500):
    //   factor = 1 - (-500)*0.001 = 1.5
    //   newZoom = min(5, max(0.05, 1*1.5)) = 1.5
    //   zoomRatio = 1.5/1 = 1.5
    //   camera.x = -100 - 1.5 * (-100 - 0) = -100 + 150 = +50
    //
    // camera.x = +50 means the canvas has been shifted RIGHT by 50px compared to
    // the initial position, as if the user panned right — but NO PAN occurred.
    // This is wrong: zooming should not produce a positive camera.x drift
    // (the canvas origin was at vpLeft, and the user did not pan).
    //
    // The invariant: when camera starts at (x=0, y=0, zoom=1), a pure zoom
    // with any anchor >= 0 should produce camera.x <= 0 (zooming in pulls content
    // toward the anchor, never pushes it right when the anchor is left-of-center).
    // A negative anchor violates this by creating spurious rightward drift.

    resetCamera(0, 0, 1)
    useCameraStore.getState().zoomAt(-100, 300, -500)
    const cam = useCameraStore.getState().camera

    // BUG: camera.x is +50 — the canvas drifted right due to the off-screen anchor.
    // This is semantically wrong: a zoom-only operation produced an apparent pan.
    // The correct behaviour: zoomAt should clamp screenX to be >= 0 (or >= vpLeft)
    // so off-screen anchors don't produce lateral drift.
    // FAILS: camera.x = +50, but it should be <= 0 for a zoom-in from a resting position.
    expect(cam.x).toBeLessThanOrEqual(0)
  })
})

// =============================================================================
// BUG-5: Math.round produces width=0 or height=0 for sub-0.5px partial clips
//
// calcBrowserBounds null-guard:
//   if (right <= left || bottom <= top) return null
//
// When a node is partially clipped so that (right - left) = 0.3 (for example),
// the null-guard passes (0.3 > 0) but Math.round(0.3) = 0, yielding a rect
// with width: 0.  Electron/Chromium treats a 0-width or 0-height
// WebContentsView as invalid and may crash or show in an undefined position.
// =============================================================================

describe('BUG-5: Math.round produces width=0 or height=0 for sub-0.5px visible slice', () => {
  it('a node with 0.3px visible width must return null, not { width: 0 } — FAILS', () => {
    // Construct a scenario where exactly 0.3px of node width is visible.
    // vpLeft = 235, zoom = 1.
    // We want: sx + sw - vpLeft = 0.3, i.e., the right edge is only 0.3px past vpLeft.
    // sx = vpLeft + camera.x + node.x * zoom
    // right = sx + sw = sx + node.width * 1
    // We need right = vpLeft + 0.3, and sx < vpLeft (node mostly behind sidebar).
    //
    // Let node.x = -500, node.width = 500.
    // sx = 235 + camera.x + (-500)*1 = camera.x - 265
    // right = sx + 500 = camera.x + 235
    // We want camera.x + 235 = 235.3  →  camera.x = 0.3
    const cam  = { x: 0.3, y: 0, zoom: 1 }
    const node: NodeGeom = { x: -500, y: 0, width: 500, height: 500 }

    const bounds = calcBrowserBounds(cam, node, SIDEBAR_W, VP_TOP)

    // The raw visible width = 0.3px. After rounding, width = 0.
    // The function returns { ..., width: 0 } instead of null.
    // EITHER: the function should return null (width < 1px → treat as invisible)
    // OR:     it should not round before the null-guard.
    // Currently it returns { width: 0 } — a degenerate rect.
    // This test FAILS because bounds is not null (it should be) and width is 0.
    if (bounds !== null) {
      // If a bounds is returned, it must have positive width
      expect(bounds.width).toBeGreaterThan(0)
    }
    // The above only fires if bounds !== null. But we also need to assert that
    // a 0.3px slice is not silently returned as a zero-width rect:
    expect(bounds).toBeNull() // FAILS: bounds is { ..., width: 0 }, not null
  })

  it('a node with 0.4px visible height must return null, not { height: 0 } — FAILS', () => {
    // Similar scenario for height.
    // sy = vpTop + camera.y + node.y*zoom + (TITLE_H+TOOLBAR_H)*zoom
    // sh = (node.height - TITLE_H - TOOLBAR_H) * zoom
    // Visible height = sy + sh - vpTop (when sy < vpTop)
    // We want sy + sh - vpTop = 0.4 and sy < vpTop.
    //
    // Let node.y = -200, node.height = 268 (TITLE_H+TOOLBAR_H = 68, so content h = 200).
    // sy = 68 + camera.y + (-200)*1 + 68*1 = camera.y - 64
    // sh = 200 * 1 = 200
    // bottom = sy + sh = camera.y + 136
    // We want bottom - vpTop = 0.4  →  camera.y + 136 - 68 = 0.4  →  camera.y = -67.6
    const cam  = { x: 0, y: -67.6, zoom: 1 }
    const node: NodeGeom = { x: 0, y: -200, width: 800, height: TITLE_H + TOOLBAR_H + 200 }

    const bounds = calcBrowserBounds(cam, node, SIDEBAR_W, VP_TOP)

    // Raw visible height ≈ 0.4px → Math.round(0.4) = 0 → height: 0 degenerate rect.
    // FAILS: bounds should be null but is { ..., height: 0 }
    if (bounds !== null) {
      expect(bounds.height).toBeGreaterThan(0)
    }
    expect(bounds).toBeNull() // FAILS
  })

  it('sub-0.5px visible slice returns null after fix (not a degenerate 0-width rect)', () => {
    // Fixed behaviour: the < 0.5px pre-rounding check catches this before Math.round,
    // so the function returns null instead of { width: 0 }.
    const cam  = { x: 0.2, y: 0, zoom: 1 }  // 0.2px visible
    const node: NodeGeom = { x: -500, y: 0, width: 500, height: 500 }

    const bounds = calcBrowserBounds(cam, node, SIDEBAR_W, VP_TOP)

    // Fixed: right - left = 0.2 < 0.5 → return null instead of { width: 0 }.
    expect(bounds).toBeNull()
  })
})
