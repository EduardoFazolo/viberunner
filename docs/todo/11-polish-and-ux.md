# 11 — Polish & UX

**Status:** TODO
**Depends on:** 10-performance-optimization

## Goal
Keyboard shortcuts, visual polish, snapping, search, and quality-of-life features that make CanvaFlow feel like a finished product.

## Tasks

### Keyboard Shortcuts
- [ ] `Cmd/Ctrl + T` — new terminal node at canvas center
- [ ] `Cmd/Ctrl + B` — new browser node at canvas center
- [ ] `Cmd/Ctrl + 0` — fit all nodes in view
- [ ] `Cmd/Ctrl + =` / `-` — zoom in/out
- [ ] `Cmd/Ctrl + Z` / `Shift+Z` — undo/redo (node create/delete/move)
- [ ] `Cmd/Ctrl + W` — close focused node
- [ ] `Cmd/Ctrl + F` — focus search bar
- [ ] `Escape` — deselect / close context menu / exit text fields
- [ ] `Space + drag` — pan canvas (already in 02, verify works when terminal has focus)

### Undo / Redo
- [ ] Implement command stack (array of `Command` objects with `do` + `undo`)
- [ ] Track: create node, delete node, move node, resize node
- [ ] Do NOT track: terminal input, webview navigation (too granular)
- [ ] Max history: 50 commands

### Node Snapping
- [ ] Optional grid snap when dragging nodes (toggle in settings)
- [ ] Snap to 20px world-space grid
- [ ] Show snap guides (faint lines) when node edges align with other nodes

### "Fit All" View
- [ ] Calculate bounding box of all nodes
- [ ] Animate camera to fit all with padding
- [ ] Animation: ease-out, ~300ms

### Node Search / Jump
- [ ] `bunx shadcn@latest add command`
- [ ] `Cmd+F` opens shadcn `CommandDialog` — full-screen palette, no custom overlay needed
- [ ] `CommandInput` for search, `CommandList` → `CommandItem` per node (title + type icon)
- [ ] Select item → close dialog, animate camera to node + briefly highlight with a ring

### Visual Polish
- [ ] Node drop shadow via Tailwind `shadow-md` / `shadow-lg` scaled with zIndex
- [ ] Focused node: `ring-2 ring-primary/50` (shadcn CSS variable, matches theme)
- [ ] Drag ghost: `opacity-70` on dragging node (Tailwind)
- [ ] Context menu animation: shadcn `ContextMenu` uses Radix's built-in `data-[state=open]` animation — customize via Tailwind in `components/ui/context-menu.tsx`
- [ ] Typography: shadcn's default font stack for UI; `font-mono` (Tailwind) for terminal labels

### Settings Panel
- [ ] `bunx shadcn@latest add sheet switch select label separator`
- [ ] `Cmd+,` opens shadcn `Sheet` (side drawer, not modal — canvas stays visible behind it)
- [ ] Settings layout using shadcn `Label` + `Switch` / `Input` / `Select` rows with `Separator` between sections:
  - Default shell → `Input`
  - Terminal font size → `Input` type=`"number"`
  - Snap to grid → `Switch`
  - Theme → `Select` (dark / darker / system)
  - tmux binary path → `Input` with a browse `Button`
- [ ] Settings persisted to SQLite

### Onboarding
- [ ] `bunx shadcn@latest add card`
- [ ] First launch: shadcn `Card` as a "Welcome" note node on the canvas explaining right-click to create
- [ ] shadcn `Tooltip` on first terminal creation explaining tmux persistence

## Acceptance Criteria
- All keyboard shortcuts work even when a terminal has focus (use Electron `globalShortcut` for app-level shortcuts)
- Undo/redo works for create/delete/move operations
- Fit-all animates smoothly
- Settings persist across restarts
