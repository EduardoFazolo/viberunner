# Monaco Editor — Improvement Plan

## Goal

Make the Monaco node a great **code reading and navigation** experience — like having a VSCode window on the canvas. You should be able to open any project and see code the way it looks in Cursor/VSCode: proper colors for every language, a git sidebar showing what changed, and fast file navigation. No heavy language server needed — this is about watching code work, not editing it like a full IDE.

## What we're NOT doing

- No LSP / language server — no `typescript-language-server`, no diagnostics, no go-to-def
- No Prettier / formatter
- No code execution or debugging

## Phases

| # | File | What |
|---|------|------|
| 1 | [01-syntax-highlighting.md](01-syntax-highlighting.md) | VSCode-quality colors for any language via TextMate grammars |
| 2 | [02-git-integration.md](02-git-integration.md) | `simple-git` in main process + git sidebar (changed files, diffs, branch) |
| 3 | [03-file-search.md](03-file-search.md) | Cmd+P fuzzy file open, Cmd+Shift+F text search |
| 4 | [04-polish.md](04-polish.md) | File icons, resizable sidebar, tab improvements |

## Key Library Decisions

### Syntax Highlighting: TextMate grammars via `vscode-textmate` + `monaco-editor-textmate`
- Monaco's built-in tokenizer is a simple regex-based tokenizer — good but not VS Code quality
- VS Code uses TextMate grammars for all its syntax highlighting — same grammars, same colors
- `vscode-textmate` (Microsoft) parses `.tmLanguage.json` grammar files
- `vscode-oniguruma` (Microsoft) provides the Oniguruma regex engine TextMate grammars need
- `monaco-editor-textmate` bridges the two into Monaco's tokenization API
- Result: Python, Go, Rust, Ruby, PHP, etc. all look exactly like they do in VS Code — without any server

### Git: `simple-git`
- Pure JS wrapper around the system git binary, no native build step, zero Electron compat issues
- `nodegit` has long-standing Electron compatibility bugs — avoid it

### Git Diff View: `@git-diff-view/react`
- GitHub-style split/unified diff, syntax highlighting, dark theme, high performance
