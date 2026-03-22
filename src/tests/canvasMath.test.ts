import { describe, it, expect, beforeEach } from 'vitest'
import { worldToScreen, screenToWorld, useCameraStore } from '../renderer/src/stores/cameraStore'
import { computeFitCamera } from '../renderer/src/utils/canvasUtils'
import type { NodeRect } from '../renderer/src/utils/canvasUtils'

// ---------------------------------------------------------------------------
// worldToScreen / screenToWorld
// ---------------------------------------------------------------------------

describe('worldToScreen', () => {
  it('maps origin to camera position at zoom 1', () => {
    const cam = { x: 100, y: 200, zoom: 1 }
    expect(worldToScreen(0, 0, cam)).toEqual({ x: 100, y: 200 })
  })

  it('applies zoom to world coordinates', () => {
    const cam = { x: 0, y: 0, zoom: 2 }
    expect(worldToScreen(50, 30, cam)).toEqual({ x: 100, y: 60 })
  })

  it('combines zoom and pan offset', () => {
    const cam = { x: 10, y: -10, zoom: 0.5 }
    expect(worldToScreen(100, 200, cam)).toEqual({ x: 60, y: 90 })
  })
})

describe('screenToWorld', () => {
  it('is the inverse of worldToScreen', () => {
    const cam = { x: 150, y: -50, zoom: 1.5 }
    const world = { x: 42, y: 77 }
    const screen = worldToScreen(world.x, world.y, cam)
    const back = screenToWorld(screen.x, screen.y, cam)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  it('maps screen origin to correct world position', () => {
    const cam = { x: 0, y: 0, zoom: 2 }
    expect(screenToWorld(0, 0, cam)).toEqual({ x: 0, y: 0 })
  })

  it('handles sub-pixel zoom correctly', () => {
    const cam = { x: 0, y: 0, zoom: 0.25 }
    const result = screenToWorld(100, 200, cam)
    expect(result.x).toBeCloseTo(400)
    expect(result.y).toBeCloseTo(800)
  })
})

// ---------------------------------------------------------------------------
// zoomAt — keeps the screen anchor point fixed in world space
// ---------------------------------------------------------------------------

describe('cameraStore.zoomAt', () => {
  beforeEach(() => {
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
  })

  it('keeps the zoomed-at screen point stationary in world space', () => {
    const store = useCameraStore.getState()
    const anchorScreen = { x: 200, y: 150 }

    const worldBefore = screenToWorld(anchorScreen.x, anchorScreen.y, store.camera)
    store.zoomAt(anchorScreen.x, anchorScreen.y, -500) // zoom in

    const worldAfter = screenToWorld(
      anchorScreen.x,
      anchorScreen.y,
      useCameraStore.getState().camera,
    )

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5)
  })

  it('clamps zoom to MIN_ZOOM (0.05)', () => {
    const store = useCameraStore.getState()
    // Zoom out by a huge amount
    store.zoomAt(0, 0, 1_000_000)
    expect(useCameraStore.getState().camera.zoom).toBeGreaterThanOrEqual(0.05)
  })

  it('clamps zoom to MAX_ZOOM (5)', () => {
    const store = useCameraStore.getState()
    // Zoom in by a huge amount
    store.zoomAt(0, 0, -1_000_000)
    expect(useCameraStore.getState().camera.zoom).toBeLessThanOrEqual(5)
  })

  it('ignores NaN screenX — camera stays unchanged', () => {
    const before = { ...useCameraStore.getState().camera }
    useCameraStore.getState().zoomAt(NaN, 0, 100)
    expect(useCameraStore.getState().camera).toEqual(before)
  })

  it('ignores NaN screenY — camera stays unchanged', () => {
    const before = { ...useCameraStore.getState().camera }
    useCameraStore.getState().zoomAt(0, NaN, 100)
    expect(useCameraStore.getState().camera).toEqual(before)
  })

  it('ignores NaN delta — camera stays unchanged', () => {
    const before = { ...useCameraStore.getState().camera }
    useCameraStore.getState().zoomAt(200, 150, NaN)
    expect(useCameraStore.getState().camera).toEqual(before)
  })

  it('ignores Infinity delta — camera stays unchanged', () => {
    const before = { ...useCameraStore.getState().camera }
    useCameraStore.getState().zoomAt(200, 150, Infinity)
    expect(useCameraStore.getState().camera).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// computeFitCamera
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<NodeRect> = {}): NodeRect {
  return { x: 0, y: 0, width: 100, height: 80, minimized: false, ...overrides }
}

function nodeMap(nodes: NodeRect[]): Map<string, NodeRect> {
  return new Map(nodes.map((n, i) => [String(i), n]))
}

describe('computeFitCamera', () => {
  it('returns null for empty node map', () => {
    expect(computeFitCamera(new Map(), 800, 600)).toBeNull()
  })

  it('centers a single node in the viewport', () => {
    const node = makeNode({ x: 0, y: 0, width: 200, height: 100 })
    const cam = computeFitCamera(nodeMap([node]), 800, 600)!
    expect(cam).not.toBeNull()

    // The node center in world space should map to the viewport center
    const nodeWorldCenterX = node.x + node.width / 2
    const nodeWorldCenterY = node.y + node.height / 2
    const screenCenter = worldToScreen(nodeWorldCenterX, nodeWorldCenterY, cam)
    expect(screenCenter.x).toBeCloseTo(400, 0)
    expect(screenCenter.y).toBeCloseTo(300, 0)
  })

  it('caps zoom at 1.5 for very small content', () => {
    const node = makeNode({ x: 0, y: 0, width: 10, height: 10 })
    const cam = computeFitCamera(nodeMap([node]), 800, 600)!
    expect(cam.zoom).toBeLessThanOrEqual(1.5)
  })

  it('reduces zoom to fit large content', () => {
    const node = makeNode({ x: 0, y: 0, width: 4000, height: 3000 })
    const cam = computeFitCamera(nodeMap([node]), 800, 600)!
    expect(cam.zoom).toBeLessThan(1)
  })

  it('accounts for minimized node height (32px)', () => {
    const normal = makeNode({ x: 0, y: 0, width: 200, height: 500, minimized: false })
    const minimized = makeNode({ x: 0, y: 0, width: 200, height: 500, minimized: true })

    const camNormal = computeFitCamera(nodeMap([normal]), 800, 600)!
    const camMinimized = computeFitCamera(nodeMap([minimized]), 800, 600)!

    // Minimized node is much smaller → zoom should be higher (more space available)
    expect(camMinimized.zoom).toBeGreaterThan(camNormal.zoom)
  })

  it('fits multiple nodes spread across the canvas', () => {
    const nodes = [
      makeNode({ x: 0, y: 0, width: 100, height: 80 }),
      makeNode({ x: 1000, y: 800, width: 100, height: 80 }),
    ]
    const cam = computeFitCamera(nodeMap(nodes), 800, 600)!

    // All nodes should be visible — their screen positions should be inside viewport
    for (const n of nodes) {
      const tl = worldToScreen(n.x, n.y, cam)
      const br = worldToScreen(n.x + n.width, n.y + n.height, cam)
      expect(tl.x).toBeGreaterThanOrEqual(0)
      expect(tl.y).toBeGreaterThanOrEqual(0)
      expect(br.x).toBeLessThanOrEqual(800)
      expect(br.y).toBeLessThanOrEqual(600)
    }
  })
})
