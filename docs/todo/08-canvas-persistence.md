# 08 — Canvas Persistence

**Status:** TODO
**Depends on:** 07-workspace-management, 05-terminal-node, 06-browser-node

## Goal
Persist and restore the full canvas state (node positions, sizes, types, camera) to/from SQLite via Bun's native `bun:sqlite`. Canvas survives app restarts.

## Stack
- **Bun SQLite** (`bun:sqlite`) — native, zero-dependency, ACID transactions
- **IPC** to bridge SQLite (main process) ↔ renderer

## Schema

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  lastOpenedAt INTEGER NOT NULL,
  color TEXT
);

CREATE TABLE canvas_nodes (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'terminal' | 'browser' | 'note'
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  zIndex INTEGER NOT NULL,
  title TEXT NOT NULL,
  minimized INTEGER NOT NULL DEFAULT 0,
  props TEXT NOT NULL DEFAULT '{}', -- JSON: type-specific data
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE canvas_cameras (
  workspaceId TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  zoom REAL NOT NULL DEFAULT 1
);

CREATE INDEX idx_canvas_nodes_workspace ON canvas_nodes(workspaceId);
```

**Node `props` by type:**
- terminal: `{ cwd, shell, tmuxSessionName }`
- browser: `{ url }`
- note: `{ content, color }`

## Tasks

### Database Setup (Main Process)
- [ ] Create `database.ts` in main process using `bun:sqlite`
- [ ] Run schema migrations on app start (CREATE TABLE IF NOT EXISTS)
- [ ] Export typed query functions: `getWorkspaces`, `saveWorkspace`, `getNodes`, `saveNodes`, `getCamera`, `saveCamera`
- [ ] Use prepared statements for all queries (performance + safety)
- [ ] Wrap bulk saves in transactions

### IPC Handlers
- [ ] `db:loadWorkspace(id)` → returns `{ nodes, camera }`
- [ ] `db:saveCanvas(workspaceId, nodes, camera)` → upsert all nodes + camera
- [ ] `db:deleteNode(id)` → delete single node
- [ ] `db:saveNode(node)` → upsert single node (for incremental saves)
- [ ] `db:getWorkspaces()` → returns all workspaces

### Auto-Save Strategy
- [ ] Debounced auto-save: after any node move/resize/create/delete, wait 500ms then save
- [ ] Camera position saved on pan/zoom end (debounced 1000ms)
- [ ] On app `before-quit` event: force immediate synchronous save (no debounce)
- [ ] Save indicator: shadcn `Sonner` toast (`bunx shadcn@latest add sonner`) — brief "Saved" toast on successful save, "Save failed" on error. Position: bottom-right, non-blocking.

### Load on Startup
- [ ] On app ready: load last active workspace ID from SQLite
- [ ] Load that workspace's nodes and camera from SQLite
- [ ] Hydrate `useNodeStore` and `useCameraStore` from loaded data
- [ ] If no saved state: start with empty canvas

### Data Integrity
- [ ] Before saving, validate node data (no NaN positions, valid types)
- [ ] On corrupt read: log error, start fresh for that workspace (don't crash)
- [ ] DB file path: `app.getPath('userData')/canvaflow.db`

## Acceptance Criteria
- All nodes persist across app restart
- Camera position (pan/zoom) restored per workspace
- Node positions, sizes, titles, types all restored correctly
- Closing and reopening app restores exact canvas state
