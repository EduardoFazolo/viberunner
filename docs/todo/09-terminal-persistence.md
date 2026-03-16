# 09 — Terminal Persistence

**Status:** TODO
**Depends on:** 08-canvas-persistence, 05-terminal-node

## Goal
Terminal sessions survive app restarts via tmux. When CanvaFlow quits, running shells (processes, working directory, scroll history) are preserved. On relaunch, terminals reattach exactly where they left off.

## How It Works

```
App Start
  └── For each terminal node in SQLite:
        └── Check if tmux session exists (tmux has-session -t <id>)
              ├── YES → attach node-pty to existing session (reattach)
              └── NO  → spawn new tmux session + shell
```

```
App Quit (before-quit)
  ├── Serialize xterm.js state → save to SQLite (scroll history, cursor pos)
  └── Detach from tmux sessions (DO NOT kill them)
      tmux stays alive in background
```

## tmux Session Naming
Each terminal node gets a deterministic tmux session name:
```
canvaflow-<workspaceId>-<nodeId>
```
This allows lookup by node ID without storing a separate mapping.

## Tasks

### tmux Integration (Main Process)
- [ ] Create `TmuxManager` class in main process:
  - `sessionExists(name): Promise<bool>` → `tmux has-session -t <name>`
  - `createSession(name, cwd, shell): Promise<void>` → `tmux new-session -d -s <name> -c <cwd>`
  - `attachSession(name): pty` → spawn `node-pty` running `tmux attach-session -t <name>`
  - `detachSession(name): void` → send `tmux detach-client -s <name>` or just kill the PTY without killing tmux
  - `listSessions(): Promise<string[]>` → `tmux list-sessions -F '#{session_name}'`
  - `killSession(name): Promise<void>` → `tmux kill-session -t <name>` (only called when node is deliberately deleted)

- [ ] tmux binary resolution:
  - Check `$PATH` for tmux
  - Bundle a static tmux binary in `resources/bin/` as fallback
  - On macOS: can use Homebrew tmux or bundled binary
  - On Linux: expect system tmux; warn if missing

### Updated PtyManager
- [ ] On `terminal:create(id, cwd, shell)`:
  1. Generate session name: `canvaflow-${workspaceId}-${nodeId}`
  2. Check if session exists
  3. If not: `TmuxManager.createSession(name, cwd, shell)`
  4. Attach via `node-pty`: `tmux attach-session -t <name>`
  5. Store PTY reference in map
- [ ] On `terminal:kill(id)`:
  - If node is being **closed** (deleted): kill tmux session
  - If app is **quitting**: detach only (leave tmux alive)

### xterm.js State Serialization
- [ ] Install `@xterm/addon-serialize`
- [ ] On app `before-quit`: for each active terminal node:
  1. Call `serializeAddon.serialize()` → string
  2. Save to `canvas_nodes.props.serializedState` in SQLite
- [ ] On terminal node mount (reattach path):
  1. Load `serializedState` from SQLite
  2. Call `xterm.write(serializedState)` before attaching new data stream
  3. This restores visible terminal output + cursor position

### Orphan Session Cleanup
- [ ] On app start: list all `canvaflow-*` tmux sessions
- [ ] Compare to workspace node IDs in SQLite
- [ ] Kill tmux sessions that have no corresponding node (orphans from deleted workspaces/nodes)
- [ ] Configurable: "keep orphans" setting for power users

### tmux Bundling for Distribution
- [ ] Research and document approach for each platform:
  - **macOS**: Bundle `tmux` binary compiled for arm64 + x86_64 (universal)
  - **Linux**: Expect system tmux; show error dialog with install instructions if missing
  - **Windows**: Not supported in v1 (tmux doesn't run natively on Windows)
- [ ] Add pre-launch check: if tmux not found, disable persistence features with clear UI warning

## Acceptance Criteria
- Quit app with a running shell (e.g., `vim` open) → relaunch → terminal reattaches with vim still running
- Terminal scroll history restored (via xterm serialize)
- Deleting a terminal node kills its tmux session
- No orphan tmux sessions after clean shutdown
- Missing tmux shows user-friendly warning, not crash
