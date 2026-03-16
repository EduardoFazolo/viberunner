# 02 — Canvas Foundation

**Status:** TODO
**Depends on:** 01-project-setup

## Goal
Build the infinite canvas: pan, zoom, and a GPU-accelerated grid background. This is the core spatial surface everything else lives on.

## Architecture

**Two-layer approach:**
1. **WebGL layer** — renders the dot/line grid, handled by a `<canvas>` element filling the window. Uses pixi.js (v8, WebGL2) for GPU-accelerated rendering.
2. **DOM overlay layer** — absolutely positioned `<div>` that is transformed with `transform: translate(x,y) scale(z)` to match the WebGL viewport. All interactive nodes (terminals, browsers) live here.

This means the camera (pan/zoom) state drives both layers in sync.

## Tasks

### Camera / Viewport System
- [ ] Define `Camera` state: `{ x: number, y: number, zoom: number }`
- [ ] Implement `useCameraStore` (Zustand) — single source of truth for camera state
- [ ] Implement pan: pointer drag on empty canvas updates `camera.x/y`
- [ ] Implement zoom: wheel event scales around cursor position (`zoom *= factor`, adjust x/y to keep point under cursor fixed)
- [ ] Clamp zoom to sane range (e.g., 0.05× – 5×)
- [ ] Expose `worldToScreen(x, y)` and `screenToWorld(x, y)` coordinate utils

### WebGL Grid (pixi.js)
- [ ] Install `pixi.js` v8
- [ ] Create `GridRenderer` component: mounts a `<canvas>` with pixi Application
- [ ] Draw dot/line grid that adapts to zoom level (coarser grid visible when zoomed out)
- [ ] Sync grid rendering with camera state via RAF (requestAnimationFrame)
- [ ] Grid adapts density at zoom thresholds (e.g., major/minor grid lines)
- [ ] Background color: deep dark (`#0d0d0d` or similar)

### DOM Overlay
- [ ] Create `CanvasOverlay` component: `<div style={{ transform: ... }}>` driven by camera
- [ ] Apply `will-change: transform` on the overlay container (GPU composite layer promotion)
- [ ] Use `transform: translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`
- [ ] Use `transform-origin: 0 0` for correct spatial math

### Input Handling
- [ ] Pointer events on the root canvas element (not bubbled from nodes)
- [ ] Distinguish drag-to-pan vs. node drag (check event target)
- [ ] Trackpad pinch-to-zoom (via `wheel` event with `ctrlKey`)
- [ ] Mouse wheel zoom
- [ ] Space+drag pan (VS Code / Figma style)
- [ ] Middle-click drag pan

### Performance Baseline
- [ ] Measure FPS with Chrome DevTools during pan/zoom — target 60fps with empty canvas
- [ ] Ensure `will-change` is only on the overlay container, not individual nodes
- [ ] Add `pointer-events: none` to grid canvas to avoid blocking DOM events

## Acceptance Criteria
- Smooth pan and zoom at 60fps on an empty canvas
- Grid re-renders correctly at all zoom levels
- Coordinate utilities pass unit tests (world↔screen round-trip)
