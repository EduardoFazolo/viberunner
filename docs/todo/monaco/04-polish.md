# 04 — Polish & UX

**Status:** TODO
**Depends on:** 01, 02, 03 (can be done incrementally alongside the others)

## Goal

Make the editor feel tight and complete — file icons, resizable sidebar, formatter, better tab behavior, and small UX wins.

## Tasks

### File Icons

- [ ] Replace the current text badges (TS/JS/PY etc.) in the file tree with proper VS Code-style SVG icons
  - Use `vscode-icons` (the icon theme) or hand-pick from `@vscode/codicons` (the icon font)
  - Map extensions → icon names (same mapping as the existing language map)
  - Directory icons: plain folder + special folders (`.git`, `node_modules`, `src`, `tests`, `public`)
  - Install: `bun add @vscode/codicons` (SVG sprite, no fonts needed)

### Resizable Sidebar

- [ ] Make the sidebar width draggable:
  - Add a 4px drag handle between the icon rail + panel and the editor area
  - On `pointerdown` on the handle, track `pointermove` to resize
  - Clamp between 160px and 480px
  - Persist the chosen width to `node.props.sidebarWidth`
  - Stop event propagation so the canvas doesn't pan during sidebar resize

### Formatter (Prettier)

- [ ] Add Prettier for format-on-save and manual format:
  - Install: `bun add prettier`
  - Run in main process via IPC (too heavy for renderer)
  - IPC: `fs:format(filePath, content, language) → string` — formats and returns result
  - In MonacoNode: hook `Cmd+Shift+F` (or `Shift+Alt+F`) to call format then apply result
  - Auto-format on save: optional, off by default, toggle in status bar

### Tab Improvements

- [ ] Tab scrolling: when tabs overflow the tab bar width, add left/right scroll arrows
- [ ] Tab reordering: drag-to-reorder tabs (use pointer events, no extra library)
- [ ] Right-click tab → context menu: Close, Close Others, Close All, Reveal in File Tree
- [ ] Middle-click to close a tab

### Status Bar Improvements

- [ ] Show branch name (from git status) in status bar left side — click to open Git panel
- [ ] Show LSP status (connecting / ready / error) as a small dot icon
- [ ] Show formatter name when active

### Editor Config Improvements

- [ ] Read `tsconfig.json` / `jsconfig.json` from rootPath and pass `compilerOptions` to the TypeScript worker — enables path aliases, strict mode, etc.
- [ ] Read `.editorconfig` if present and apply tab size / indent style overrides
- [ ] Persist per-file cursor position: save `{ line, column }` in a Map when switching tabs; restore on re-open

### Keyboard Shortcuts to Add

| Shortcut | Action |
|----------|--------|
| `Cmd+P` | Quick file open (phase 03) |
| `Cmd+Shift+F` | Text search (phase 03) |
| `Cmd+Shift+G` | Toggle git panel |
| `Cmd+\` | Split editor (future) |
| `Cmd+B` | Toggle sidebar |
| `Cmd+Shift+P` | Monaco command palette |

### Node Resize Handle

The current Monaco node uses the standard `BaseNode` resize. Ensure:
- [ ] Minimum width: 600px (editor is unusable below this)
- [ ] Minimum height: 400px
- [ ] Sidebar and editor flex correctly during resize without layout jank
