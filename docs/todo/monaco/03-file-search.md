# 03 — File Search

**Status:** TODO
**Depends on:** nothing (self-contained)

## Goal

Two search modes, both accessible via keyboard shortcuts:

1. **Cmd+P — Quick file open**: fuzzy search across all filenames in the project tree, open on select
2. **Cmd+Shift+F — Text search**: search content across all files (like VSCode's global search), show results grouped by file with line previews

## Stack

- `fuse.js` or native JS filtering for fuzzy filename matching (no install needed for simple case)
- `ripgrep` binary (bundled or system) for fast content search — OR fall back to recursive `fs.readFile` with regex if rg not available
- The existing `window.fs.readDir` IPC for building the file index

## Architecture

Both search modes live in `src/plugins/monaco/renderer/SearchOverlay.tsx` — a floating modal overlay rendered inside the Monaco node (not a separate sidebar panel).

```
[Cmd+P]  → SearchOverlay in "file" mode   → shows fuzzy-matched filenames
[Cmd+Shift+F] → SearchOverlay in "text" mode  → shows grep results
```

## Tasks

### Cmd+P — Quick File Open

- [ ] Build a flat file index from `window.fs.readDir` (recursive) when rootPath is set, cache it
  - Rebuild on file-tree refresh
  - Index format: `{ relativePath: string, absolutePath: string }[]`
- [ ] Create `SearchOverlay.tsx`:
  - Triggered by `Cmd+P` keydown in the Monaco node's container
  - Floating centered modal (like VSCode's command palette)
  - Input field, list of results below
  - Fuzzy filter: score matches using simple substring ranking (or `fuse.js`)
  - Keyboard: `↑`/`↓` to navigate, `Enter` to open, `Escape` to close
  - On select: call the existing `openFile(path)` logic from `MonacoNode`

### Cmd+Shift+F — Text Search

- [ ] Add IPC handler `fs:search` in main process:
  - Try to use system `rg` (ripgrep) if available: `rg --json -i <query> <rootPath>`
  - Fall back to recursive read + regex if `rg` not found
  - Return: `{ file: string, matches: { line: number, text: string }[] }[]`
  - Stream results back as they come (use `ipcMain.emit` progressively, not one big await)
- [ ] Extend `SearchOverlay.tsx` with "text" mode:
  - Query input, optional regex toggle, case-sensitive toggle
  - Results grouped by file (collapsible)
  - Click a result line → open that file at that line number in Monaco
  - Show match count badge

### Notes

- Stop event propagation on the overlay's `keydown` so `Cmd+P` doesn't also trigger Monaco's built-in command palette — call `e.stopPropagation()` and `e.preventDefault()` before showing the overlay
- The overlay should close on click-outside or `Escape`
- Cache the file index in a `useRef` on the MonacoNode, rebuild when rootPath changes
