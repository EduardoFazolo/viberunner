import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

// ---------------------------------------------------------------------------
// Types (mirrored in renderer via preload)
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
}

export interface NodeRow {
  id: string
  workspaceId: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: number // 0 | 1
  props: string     // JSON
  createdAt: number
  updatedAt: number
}

export interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}

export interface BrowserSessionRow {
  id: string
  name: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// DB instance
// ---------------------------------------------------------------------------

let db: Database.Database

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'canvaflow.db')

  try {
    db = new Database(dbPath, { verbose: undefined })
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate()
    console.log('[db] Initialized at', dbPath)
  } catch (err) {
    console.error('[db] Failed to initialize database:', err)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL,
      lastOpenedAt INTEGER NOT NULL,
      color       TEXT
    );

    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id          TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      x           REAL NOT NULL,
      y           REAL NOT NULL,
      width       REAL NOT NULL,
      height      REAL NOT NULL,
      zIndex      INTEGER NOT NULL,
      title       TEXT NOT NULL,
      minimized   INTEGER NOT NULL DEFAULT 0,
      props       TEXT NOT NULL DEFAULT '{}',
      createdAt   INTEGER NOT NULL,
      updatedAt   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canvas_cameras (
      workspaceId TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      x           REAL NOT NULL DEFAULT 0,
      y           REAL NOT NULL DEFAULT 0,
      zoom        REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace ON canvas_nodes(workspaceId);

    CREATE TABLE IF NOT EXISTS browser_sessions (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `)
}

// ---------------------------------------------------------------------------
// Workspace queries
// ---------------------------------------------------------------------------

export function getWorkspaces(): WorkspaceRow[] {
  return db.prepare('SELECT * FROM workspaces ORDER BY lastOpenedAt DESC').all() as WorkspaceRow[]
}

export function saveWorkspace(w: WorkspaceRow): void {
  db.prepare(`
    INSERT INTO workspaces (id, name, path, lastOpenedAt, color)
    VALUES (@id, @name, @path, @lastOpenedAt, @color)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      lastOpenedAt = excluded.lastOpenedAt,
      color = excluded.color
  `).run(w)
}

export function deleteWorkspace(id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Node queries
// ---------------------------------------------------------------------------

export function getNodes(workspaceId: string): NodeRow[] {
  return db.prepare('SELECT * FROM canvas_nodes WHERE workspaceId = ? ORDER BY zIndex ASC')
    .all(workspaceId) as NodeRow[]
}

export function saveNodes(workspaceId: string, nodes: NodeRow[]): void {
  const upsert = db.prepare(`
    INSERT INTO canvas_nodes
      (id, workspaceId, type, x, y, width, height, zIndex, title, minimized, props, createdAt, updatedAt)
    VALUES
      (@id, @workspaceId, @type, @x, @y, @width, @height, @zIndex, @title, @minimized, @props, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      x = excluded.x, y = excluded.y,
      width = excluded.width, height = excluded.height,
      zIndex = excluded.zIndex, title = excluded.title,
      minimized = excluded.minimized, props = excluded.props,
      updatedAt = excluded.updatedAt
  `)

  // Delete nodes no longer in the list
  const ids = nodes.map((n) => n.id)
  const existing = db.prepare('SELECT id FROM canvas_nodes WHERE workspaceId = ?').all(workspaceId) as { id: string }[]
  const toDelete = existing.filter((r) => !ids.includes(r.id))
  const del = db.prepare('DELETE FROM canvas_nodes WHERE id = ?')

  const run = db.transaction(() => {
    for (const row of toDelete) del.run(row.id)
    for (const node of nodes) upsert.run(node)
  })
  run()
}

export function deleteNode(id: string): void {
  db.prepare('DELETE FROM canvas_nodes WHERE id = ?').run(id)
}

export function mergeNodeProps(nodeId: string, patch: Record<string, unknown>): void {
  const row = db.prepare('SELECT props FROM canvas_nodes WHERE id = ?').get(nodeId) as { props: string } | null
  if (!row) return
  let current: Record<string, unknown> = {}
  try { current = JSON.parse(row.props) } catch {}
  const merged = JSON.stringify({ ...current, ...patch })
  db.prepare('UPDATE canvas_nodes SET props = ?, updatedAt = ? WHERE id = ?')
    .run(merged, Date.now(), nodeId)
}

// ---------------------------------------------------------------------------
// Browser session queries
// ---------------------------------------------------------------------------

export function getBrowserSessions(): BrowserSessionRow[] {
  return db.prepare('SELECT * FROM browser_sessions ORDER BY createdAt ASC').all() as BrowserSessionRow[]
}

export function saveBrowserSession(s: BrowserSessionRow): void {
  db.prepare(`
    INSERT INTO browser_sessions (id, name, createdAt) VALUES (@id, @name, @createdAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `).run(s)
}

export function deleteBrowserSession(id: string): void {
  db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(id)
}

export function getAllNodeIds(): string[] {
  return (db.prepare('SELECT id FROM canvas_nodes').all() as { id: string }[]).map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Camera queries
// ---------------------------------------------------------------------------

export function getCamera(workspaceId: string): CameraRow | null {
  return db.prepare('SELECT * FROM canvas_cameras WHERE workspaceId = ?')
    .get(workspaceId) as CameraRow | null
}

export function saveCamera(cam: CameraRow): void {
  db.prepare(`
    INSERT INTO canvas_cameras (workspaceId, x, y, zoom)
    VALUES (@workspaceId, @x, @y, @zoom)
    ON CONFLICT(workspaceId) DO UPDATE SET x = excluded.x, y = excluded.y, zoom = excluded.zoom
  `).run(cam)
}

// ---------------------------------------------------------------------------
// App state (last active workspace, etc.)
// ---------------------------------------------------------------------------

export function getAppState(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function setAppState(key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}
