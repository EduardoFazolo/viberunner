# CanvaFlow — Implementation Overview

An infinite canvas workspace tool. Embed live terminal sessions and browser windows on a spatial canvas. Multiple workspaces (directories). Everything persists.

---

## Dependency Order

```
01-project-setup
  └── 02-canvas-foundation
        └── 03-node-system
              └── 04-context-menu
                    ├── 05-terminal-node ──────────────────────┐
                    └── 06-browser-node ──┐                    │
              └── 07-workspace-management │                    │
                    └── 08-canvas-persistence                  │
                          ├── 08b-browser-persistence          │
                          └── 09-terminal-persistence ◄────────┘
                                └── 10-performance-optimization
                                      └── 11-polish-and-ux
```

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun | Fast, native SQLite, replaces npm/node |
| Desktop | Electron (latest) | Browser embedding, native PTY access |
| Build | electron-vite + Vite 5 | HMR in dev, optimized prod builds |
| UI | React 18 + TypeScript | Component model, ecosystem |
| UI components | shadcn/ui + Tailwind CSS v4 | Clean, composable, dark-mode-first |
| Canvas rendering | pixi.js v8 (WebGL2) | GPU-accelerated grid/background |
| Node layout | CSS transforms + DOM overlay | Interactive elements work natively |
| State | Zustand | Minimal, selector-based, no boilerplate |
| Terminal renderer | xterm.js + @xterm/addon-webgl | Renders terminal UI in canvas node (GPU-accelerated); migrate to libghostty once API stabilizes |
| PTY bridge | node-pty | Connects renderer to shell process via IPC |
| Session persistence | tmux | Keeps shell alive when app closes; node-pty reattaches on relaunch |
| Browser embedding | Electron `<webview>` | DOM-transformable, in-canvas |
| Persistence | Bun SQLite (`bun:sqlite`) | Native, ACID, zero deps, fast |

---

## Persistence Strategy

### Canvas Layout
- Stored in SQLite: node positions, sizes, types, workspace ID
- Auto-saved with 500ms debounce on any change
- Force-saved synchronously on `before-quit`
- Camera (pan/zoom) saved per workspace

### Terminal Sessions
- Each terminal node spawns/attaches a **tmux session** named `canvaflow-<workspaceId>-<nodeId>`
- On quit: detach from tmux (leave session alive)
- On launch: reattach `node-pty` to existing tmux session
- xterm.js scroll history serialized via `@xterm/addon-serialize` and stored in SQLite
- On reattach: write serialized state first, then live stream

### Browser Nodes (see `08b-browser-persistence.md`)
- **Layer 1 (automatic):** Electron `persist:canvaflow-ws-<workspaceId>` partition handles cookies, localStorage, IndexedDB, cache — no code needed, all on disk
- **Layer 2 (SQLite):** Current URL saved on every navigation
- **Layer 3 (SQLite):** Navigation history (back/forward stack) via `webContents.navigationHistory` API → soft-history array, restored as manual navigation on relaunch
- **Layer 4 (SQLite):** Scroll position (`executeJavaScript` capture) + in-page zoom factor
- **Layer 5 (SQLite, encrypted):** sessionStorage captured on quit via `executeJavaScript`, encrypted with `safeStorage` (OS keychain-backed), injected back after page load — same as Chrome/Firefox session restore
- Per-workspace session isolation (different workspaces can be logged into different accounts)

---

## Performance Strategy

| Problem | Solution |
|---|---|
| Many nodes slow down DOM | Viewport culling: only render visible nodes |
| Off-screen terminals eat CPU | Pause xterm.js rendering + buffer PTY output |
| Smooth pan/zoom | CSS transform on single overlay container (GPU layer) |
| Dense graph background | WebGL (pixi.js) grid — one GPU draw call |
| Webview render cost at small zoom | Thumbnail mode: `capturePage()` below 0.3× zoom |
| React re-render storms | Camera changes don't trigger node re-renders |
| VRAM pressure | `will-change` only on actively dragged elements |

---

## Features

**Canvas**
- Infinite pan + zoom
- GPU-accelerated dot/line grid
- Viewport culling (only render visible nodes)

**Nodes**
- Draggable, resizable cards
- Minimize to title bar
- Bring to front / send to back
- Context menu (right-click)

**Terminal Nodes**
- Full terminal emulator (xterm.js, WebGL renderer)
- Runs real PTY via node-pty
- Configurable shell and working directory
- Session persistence via tmux (survives app restarts)
- Scroll history persistence

**Browser Nodes**
- Live embedded browser (`<webview>`)
- URL bar, back/forward/reload
- Page title → node title
- Thumbnail mode at low zoom
- Cookie/session persistence via Electron partition

**Workspaces**
- Multiple workspaces (directories)
- Sidebar switcher
- Per-workspace canvas state
- Per-workspace camera position

**Persistence**
- SQLite database for all state
- tmux for terminal sessions
- Auto-save with debounce

**Performance**
- 60fps pan/zoom
- Off-screen resource throttling
- GPU grid rendering
- Lazy node mounting

**UX**
- Keyboard shortcuts
- Undo/redo (node operations)
- Grid snapping (optional)
- Fit-all-nodes view
- Node search/jump
- Settings panel

---

## Not in v1
- Note nodes (text/markdown)
- Node connections/arrows
- Remote workspaces (SSH)
- Collaboration / multiplayer
- Plugin system
- Windows support (tmux limitation)
- libghostty terminal renderer (technically usable via C FFI, but API is not yet stable — upstream changes would break us; revisit once Ghostty publishes a stable libghostty release)
