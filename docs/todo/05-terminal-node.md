# 05 — Terminal Node

**Status:** TODO
**Depends on:** 04-context-menu

## Goal
Embed a fully functional terminal emulator inside a canvas node. Uses xterm.js (WebGL renderer) in the renderer process connected to a node-pty PTY in the main process via IPC.

## Stack
- **xterm.js** + `@xterm/addon-webgl` (GPU-accelerated rendering)
- **@xterm/addon-fit** (resize terminal to container)
- **@xterm/addon-web-links** (clickable URLs)
- **node-pty** (PTY process in main process)
- IPC channel: `terminal:create`, `terminal:data`, `terminal:resize`, `terminal:kill`

## Architecture

```
Renderer (xterm.js)  ←→  preload IPC bridge  ←→  Main (node-pty PTY)
     write(data)              ↕                      data event → send to renderer
     onData → send to main    ↕                      write(data from renderer)
```

Each terminal node has a unique `terminalId` that maps to a PTY instance in main.

## Tasks

### Main Process — PTY Manager
- [ ] Install `node-pty` (native module, requires build step in electron-builder config)
- [ ] Create `PtyManager` class in main process:
  - `create(terminalId, cwd, shell)` → spawns PTY, stores in `Map<id, IPty>`
  - `write(terminalId, data)` → writes to PTY stdin
  - `resize(terminalId, cols, rows)` → resizes PTY
  - `kill(terminalId)` → kills PTY
- [ ] Register IPC handlers: `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:kill`
- [ ] Push PTY output to renderer via `webContents.send('terminal:data', terminalId, data)`
- [ ] Default shell: `$SHELL` or `/bin/zsh` on macOS, `/bin/bash` on Linux
- [ ] Default CWD: workspace directory (from node props) or `$HOME`

### Preload Bridge
- [ ] Expose typed terminal API via `contextBridge`:
  ```ts
  terminal: {
    create(id, cwd, shell): Promise<void>
    write(id, data): void
    resize(id, cols, rows): void
    kill(id): void
    onData(id, callback): () => void  // returns unsubscribe fn
  }
  ```

### Renderer — TerminalNode Component
- [ ] `<TerminalNode>` extends `<BaseNode>` with terminal content area
- [ ] On mount: call `terminal.create(id, node.cwd, node.shell)`
- [ ] Initialize xterm.js `Terminal` with:
  - `fontFamily: 'JetBrains Mono, Menlo, monospace'`
  - `fontSize: 13`
  - `theme`: dark theme matching CanvaFlow palette
  - `allowTransparency: false` (perf)
  - `scrollback: 1000`
- [ ] Load `@xterm/addon-webgl` — fall back to `@xterm/addon-canvas` if WebGL unavailable
- [ ] Load `@xterm/addon-fit` — call `fit.fit()` on mount and on node resize
- [ ] On xterm `onData`: call `terminal.write(id, data)` via IPC
- [ ] On IPC `terminal:data`: call `xterm.write(data)`
- [ ] On node resize: debounce → `fit.fit()` → `terminal.resize(id, cols, rows)`
- [ ] On unmount: `terminal.kill(id)` (unless persisted — see step 08)

### WebGL Renderer Fallback
- [ ] Try loading `@xterm/addon-webgl`; if it throws (GPU unavailable), fall back to `@xterm/addon-canvas`
- [ ] Log which renderer was activated (helps debugging)

### Node-PTY Native Build
- [ ] Add `node-pty` to `externals` in Vite main config (don't bundle native modules)
- [ ] Configure `electron-builder` to rebuild `node-pty` for target Electron version
- [ ] Add `postinstall` script: `electron-rebuild -f -w node-pty`

## Acceptance Criteria
- Right-click canvas → "New Terminal" opens a working terminal node
- Terminal responds to keyboard input
- Terminal resizes when node is resized
- Shell runs with correct CWD (workspace directory if set)
- GPU (WebGL) renderer is active on capable machines
