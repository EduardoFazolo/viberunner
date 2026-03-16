# 04 — Context Menu

**Status:** TODO
**Depends on:** 03-node-system

## Goal
Right-click context menu on the canvas (and on nodes) for creating and managing nodes.

## Tasks

### shadcn Setup
- [ ] `bunx shadcn@latest add context-menu`
- [ ] shadcn `ContextMenu` is built on Radix UI — keyboard nav, dismiss, and boundary-flipping are handled automatically. No custom store or positioning logic needed.

### Canvas Context Menu (right-click on empty canvas)
- [ ] Wrap the canvas root in shadcn `<ContextMenu>` with `<ContextMenuTrigger asChild>`
- [ ] Convert click position from screen coords to world coords on trigger
- [ ] `<ContextMenuContent>` items:
  - `<ContextMenuItem>` **New Terminal** → creates `terminal` node at world position
  - `<ContextMenuItem>` **New Browser** → creates `browser` node at world position
  - `<ContextMenuItem>` **New Note** → creates `note` node at world position (future)
  - `<ContextMenuSeparator />`
  - `<ContextMenuItem>` **Fit All Nodes** → zoom/pan to fit all nodes in view

### Node Context Menu (right-click on node `CardHeader`)
- [ ] Each `<BaseNode>` also wrapped in `<ContextMenu>` with separate `<ContextMenuContent>`:
  - `<ContextMenuItem>` **Rename**
  - `<ContextMenuItem>` **Duplicate**
  - `<ContextMenuSub>` **Order** → `<ContextMenuSubContent>`: Bring to Front, Send to Back
  - `<ContextMenuItem>` **Minimize / Restore**
  - `<ContextMenuSeparator />`
  - `<ContextMenuItem>` **Close** — use `className="text-destructive"` for red tint

## Acceptance Criteria
- Right-click on empty canvas shows creation options
- Right-click on node shows node options
- Selecting "New Terminal" spawns a terminal node at the cursor's world position
- Menu is dismissed by click-outside or Escape
