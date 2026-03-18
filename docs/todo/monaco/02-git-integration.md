# 02 — Git Integration

**Status:** TODO
**Depends on:** nothing (self-contained, parallel with 01)

## Goal

A Cursor-style git sidebar panel inside the Monaco node showing:
- Current branch name + dirty indicator in the status bar
- List of changed files (M / A / D / U / ? badges, like VSCode's Source Control view)
- Click a changed file → open a split diff view (old vs new) using `@git-diff-view/react`
- Stage / unstage individual files or all
- Commit message input + commit button
- Refresh on file save (auto-poll or watch)

## Stack

- `simple-git` — runs in Electron main process, wraps the system git binary
- `@git-diff-view/react` — GitHub-style split diff component in the renderer
- No `nodegit` (native binding hell with Electron) / no `isomorphic-git` (doesn't use system git)

## Architecture

```
Electron Main Process
  └─ simple-git(rootPath)
       git.status() → StatusResult
       git.diff(['HEAD', '--', file]) → string (unified diff)
       git.add([file]) / git.reset(['HEAD', file])
       git.commit(message)
       git.log({ maxCount: 50 }) → LogResult
       git.branch() → BranchSummary

Renderer (MonacoNode.tsx)
  └─ Git sidebar panel (new GitPanel component)
       └─ @git-diff-view/react (diff display)
       └─ IPC calls to main for all git operations
```

## IPC Surface

Add to `src/plugins/monaco/main/gitHandlers.ts` and expose via preload:

```ts
git: {
  // existing: clone
  status: (repoPath: string) => Promise<GitStatus>
  diff: (repoPath: string, filePath: string, staged: boolean) => Promise<string>
  stage: (repoPath: string, filePaths: string[]) => Promise<void>
  unstage: (repoPath: string, filePaths: string[]) => Promise<void>
  commit: (repoPath: string, message: string) => Promise<void>
  log: (repoPath: string, maxCount?: number) => Promise<GitLogEntry[]>
  branch: (repoPath: string) => Promise<{ current: string; all: string[] }>
  checkout: (repoPath: string, branchName: string) => Promise<void>
  isRepo: (dirPath: string) => Promise<boolean>
}
```

```ts
interface GitStatus {
  branch: string
  files: GitFileStatus[]
  ahead: number
  behind: number
}
interface GitFileStatus {
  path: string
  index: 'M' | 'A' | 'D' | 'R' | '?' | ' '   // staged status
  working: 'M' | 'A' | 'D' | 'R' | '?' | ' '  // unstaged status
}
interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}
```

## Tasks

### Main Process

- [ ] Install: `bun add simple-git`
- [ ] Create `src/plugins/monaco/main/gitHandlers.ts`:
  - `registerGitHandlers(ipc)` function
  - Implement all IPC handlers listed above using `simple-git`
  - Cache `SimpleGit` instances keyed by `repoPath`
  - Handle errors gracefully — if not a git repo, return empty status instead of throwing
- [ ] Register in `src/plugins/monaco/main/index.ts`
- [ ] Extend `src/preload/index.ts` and `window.d.ts` with the new `git.*` methods

### Renderer — Git Panel Component

- [ ] Install: `bun add @git-diff-view/react`
- [ ] Create `src/plugins/monaco/renderer/GitPanel.tsx`:
  - **Header**: branch name, refresh button, sync indicator (ahead/behind)
  - **Changes section**: list of unstaged files with M/A/D/? badge + filename
    - Click row → open diff view
    - `+` button to stage individual file
    - "Stage All" button
  - **Staged section**: list of staged files with badge
    - Click row → open staged diff view
    - `-` button to unstage individual file
    - "Unstage All" button
  - **Commit section**: `<textarea>` for commit message + "Commit" button (disabled if message empty or staged is empty)
  - **Diff view** (shown when a file is selected): `@git-diff-view/react` in split mode, dark theme

- [ ] Wire `GitPanel` into `MonacoNode.tsx`:
  - Add "Git" icon to the sidebar icon rail (below Files icon)
  - Toggle between file tree and git panel
  - Auto-refresh git status on every file save
  - Poll git status every 30s as fallback

### Sidebar Icon Rail

The left sidebar should switch between panels via icon buttons (like VSCode/Cursor):

```
[Files icon]   ← current file tree
[Git icon]     ← new git panel (shows a dot badge if dirty)
[Search icon]  ← phase 03
```

This means the sidebar becomes a two-part layout:
- Left: narrow icon rail (36px)
- Right: panel content (current 240px file tree or git panel)

### File Tree Git Decorations

- [ ] After fetching git status, overlay file/folder color indicators in the existing file tree:
  - Modified (M): yellow/orange filename text
  - Untracked (?): green filename text
  - Staged (index M/A): brighter green
  - Deleted (D): red + strikethrough

## Notes

- `simple-git` requires `git` to be in `$PATH` — it will fail silently on machines without git (show a "git not found" state in the panel)
- Diff for untracked files: `git diff /dev/null <file>` — `simple-git` can do this with `git.diff(['--no-index', '/dev/null', filePath])`
- For staged diffs: `git diff --cached -- <file>`
- For unstaged diffs: `git diff -- <file>`
