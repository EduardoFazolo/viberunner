# 07 — Workspace Management

**Status:** TODO
**Depends on:** 03-node-system

## Goal
Implement the workspace concept: a workspace is a directory on disk. Users can have multiple workspaces. The left sidebar shows workspaces and allows switching between them. Each workspace has its own canvas.

## Architecture

```
WorkspaceStore (Zustand + persisted to SQLite)
  workspaces: Workspace[]
    id, name, path, lastOpenedAt
  activeWorkspaceId: string
```

Each workspace maps 1:1 to a canvas layout. Switching workspaces switches the canvas state.

## Tasks

### Workspace Data Model
- [ ] Define `Workspace`:
  ```ts
  type Workspace = {
    id: string
    name: string
    path: string      // absolute directory path
    lastOpenedAt: number
    color?: string    // accent color for sidebar
  }
  ```
- [ ] `useWorkspaceStore` (Zustand) with: `add`, `remove`, `setActive`, `rename`

### Sidebar Component
- [ ] `bunx shadcn@latest add sidebar button tooltip separator`
- [ ] Use shadcn `Sidebar` / `SidebarMenu` / `SidebarMenuItem` / `SidebarMenuButton` primitives
- [ ] Each workspace item is a `SidebarMenuButton` — active state via `isActive` prop
- [ ] Workspace color dot rendered inside `SidebarMenuButton`
- [ ] Per-workspace settings icon → shadcn `Button` variant=`"ghost"` size=`"icon"` with `Tooltip`
- [ ] `SidebarFooter`: shadcn `Button` variant=`"ghost"` for **+ Add Workspace**
- [ ] Drag to reorder: custom drag logic on top of `SidebarMenuItem` (shadcn has no built-in DnD)
- [ ] Collapsible via shadcn `SidebarRail`

### Add Workspace Flow
- [ ] "+" button opens directory picker via IPC → `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- [ ] After picking directory: shadcn `Dialog` with an `Input` pre-filled with directory name for rename-before-add
- [ ] Confirm → new workspace gets empty canvas, saved to SQLite immediately

### Remove Workspace
- [ ] `bunx shadcn@latest add alert-dialog`
- [ ] Confirmation via shadcn `AlertDialog` (not a browser `confirm()`) before removal
- [ ] Removes workspace record from SQLite (canvas layout preserved by default for recovery)
- [ ] Does NOT delete the directory from disk

### Workspace Switching
- [ ] Switching saves current canvas layout to SQLite
- [ ] Loads new workspace's canvas layout from SQLite
- [ ] Restores camera position (pan/zoom) for the workspace
- [ ] Transition: brief fade or instant (decide during implementation)

### IPC: File System Access
- [ ] `workspace:openDialog` → `dialog.showOpenDialog`
- [ ] `workspace:readDir(path)` → returns directory listing (for future file tree)
- [ ] `workspace:watchDir(path)` → fs.watch for live file changes (future)

## Acceptance Criteria
- Sidebar shows all workspaces
- Can add a workspace by picking a directory
- Switching workspaces changes canvas content
- Last used workspace is restored on app restart
