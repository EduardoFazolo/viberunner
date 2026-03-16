# 10 — Performance Optimization

**Status:** TODO
**Depends on:** 09-terminal-persistence, 06-browser-node

## Goal
Ensure CanvaFlow stays performant with many nodes — 50+ terminals, browsers, and notes — at any zoom level. Focus on GPU utilization, DOM management, and off-screen resource throttling.

## Performance Budget
- Canvas pan/zoom: 60fps (16ms frame budget)
- Node creation: < 100ms perceived latency
- App startup (with 20 nodes): < 2 seconds to interactive
- Memory: < 500MB RAM with 20 active terminal nodes

## Strategies

### 1. Viewport Culling (already started in 03)
- [ ] Audit: ensure all off-screen nodes are unmounted from DOM
- [ ] Add spatial index (`rbush` or simple grid) for O(log n) visible-node queries
- [ ] Padding: nodes within 500px screen-space of viewport edge stay mounted (prevents flicker on fast pan)
- [ ] Measure: confirm DOM node count is bounded by viewport capacity, not total node count

### 2. Terminal Throttling (Off-Screen)
- [ ] When a terminal node is outside the viewport:
  - Pause xterm.js rendering (call `terminal.pause()` if available, else stop writing to DOM)
  - Buffer PTY output in main process (ring buffer, max 10MB per terminal)
  - On re-entry to viewport: flush buffer to xterm.js, resume rendering
- [ ] This prevents off-screen terminals from eating CPU for rendering

### 3. WebGL Grid Optimization
- [ ] Profile grid rendering with Chrome DevTools GPU timeline
- [ ] Use instanced rendering for grid dots (one draw call for all dots)
- [ ] LOD: coarser geometry when zoomed out far
- [ ] Skip grid render when no camera change (dirty flag)

### 4. CSS Compositing Layers
- [ ] Audit `will-change` usage — only on the canvas overlay container
- [ ] Add `will-change: transform` to nodes that are actively being dragged (add/remove dynamically)
- [ ] Remove `will-change` from static nodes to reduce VRAM pressure
- [ ] Use Chrome DevTools > Layers to audit composite layer count

### 5. React Rendering Optimization
- [ ] All node components wrapped in `React.memo`
- [ ] Node store selectors use shallow equality to prevent unnecessary re-renders
- [ ] Camera store updates DO NOT re-render node components (nodes read camera only for culling check, not for positioning — positioning is done by the overlay container transform)
- [ ] Profile with React DevTools Profiler before and after

### 6. Webview Thumbnail Mode
- [ ] When canvas zoom < 0.3: replace live `<webview>` with `<img>` screenshot
- [ ] Schedule screenshots via `webview.capturePage()` on a low-priority timer
- [ ] Cache screenshots; only refresh when tab is active and visible
- [ ] This avoids rendering full browser engines when nodes are tiny

### 7. IPC Batching
- [ ] Terminal data IPC: batch rapid PTY output (e.g., every 16ms flush) instead of one `send()` per byte chunk
- [ ] Canvas save IPC: already debounced (from step 08) — confirm debounce is working

### 8. Memory Management
- [ ] When a terminal node is removed from canvas: ensure PTY is killed AND xterm.js instance is disposed
- [ ] Implement `useEffect` cleanup in all node components (no memory leaks on unmount)
- [ ] Track renderer process memory in DevTools periodically during development

### 9. GPU Hardware Acceleration (Electron)
- [ ] Verify hardware acceleration is active: `chrome://gpu` in DevTools
- [ ] Add `app.commandLine.appendSwitch('enable-gpu-rasterization')` in main for extra GPU canvas rasterization
- [ ] On multi-GPU systems (MacBook with discrete + integrated): add `--force_high_performance_gpu` flag option in settings
- [ ] Disable acceleration gracefully if GPU errors detected (Chromium will do this automatically but log it)

### 10. Startup Performance
- [ ] Lazy-load node type implementations (terminal, browser, note) — don't import xterm.js until a terminal node exists
- [ ] SQLite load: async, non-blocking — show canvas immediately, hydrate nodes as data arrives
- [ ] Splash screen or skeleton nodes while loading

## Tooling
- [ ] Add `electron-devtools-installer` for React DevTools + Redux DevTools in dev
- [ ] Document performance profiling workflow in `docs/PROFILING.md`
- [ ] Add FPS counter overlay (dev mode only): shows current canvas FPS

## Acceptance Criteria
- 60fps pan/zoom with 30 nodes in viewport
- Off-screen terminal nodes do not consume renderer CPU
- App starts in < 2s with a saved canvas of 20 nodes
- No memory leaks after 1hr of use (stable heap in DevTools)
