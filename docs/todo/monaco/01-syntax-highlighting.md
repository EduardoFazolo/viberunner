# 01 — VSCode-Quality Syntax Highlighting

**Status:** TODO
**Depends on:** nothing

## Goal

Replace Monaco's built-in tokenizer with TextMate grammar-based highlighting — the exact same system VS Code uses. This makes every language look correct: Python's decorators, Rust's lifetimes, Go's struct tags, Ruby blocks, etc. The current Monaco tokenizer is good for JS/TS but mediocre for everything else.

## What changes visually

Before: Monaco's regex tokenizer — broad token categories, sometimes wrong colors
After: TextMate grammar — same granular token scopes as VS Code, mapped to the same color theme

## Stack

- `vscode-textmate` — Microsoft's TextMate grammar parser (the same one VS Code uses)
- `vscode-oniguruma` — Oniguruma WASM regex engine required by vscode-textmate
- `monaco-editor-textmate` — bridges vscode-textmate tokens into Monaco's `ITokensProvider` API
- Grammar files — `.tmLanguage.json` files, sourced from VS Code's built-in extensions

## Architecture

```
At editor init time:
  1. Load vscode-oniguruma WASM binary (bundled via Vite ?url import)
  2. Load .tmLanguage.json grammar files (bundled as JSON imports)
  3. Register each grammar with Monaco via wireTmGrammars(monaco, registry, grammars)

Per file open:
  Monaco uses the registered TextMate tokenizer instead of its built-in one
  → tokens map to VS Code Dark+ color theme rules
  → editor renders with VS Code-quality colors
```

## Tasks

### Install

```bash
bun add vscode-textmate vscode-oniguruma monaco-editor-textmate
```

### Grammar Files

- [ ] Source `.tmLanguage.json` files from VS Code's built-in extensions (MIT licensed, open source):
  - `TypeScript.tmLanguage.json` (from `vscode/extensions/typescript-basics`)
  - `JavaScript.tmLanguage.json`
  - `Python.tmLanguage.json` (from `vscode/extensions/python`)
  - `rust.tmLanguage.json` (from `vscode/extensions/rust`)
  - `go.tmLanguage.json`
  - `css.tmLanguage.json`, `html.tmLanguage.json`, `json.tmLanguage.json`
  - `shellscript.tmLanguage.json`
  - `markdown.tmLanguage.json`
  - Add more as needed — each is a self-contained JSON file
- [ ] Store them in `src/plugins/monaco/grammars/` as JSON files
- [ ] Add a `grammarMap.ts` mapping Monaco language IDs → grammar files and scope names:
  ```ts
  export const grammarMap: Record<string, { scopeName: string; path: string }> = {
    typescript: { scopeName: 'source.ts', path: './TypeScript.tmLanguage.json' },
    javascript: { scopeName: 'source.js', path: './JavaScript.tmLanguage.json' },
    python: { scopeName: 'source.python', path: './Python.tmLanguage.json' },
    rust: { scopeName: 'source.rust', path: './rust.tmLanguage.json' },
    go: { scopeName: 'source.go', path: './go.tmLanguage.json' },
    // ...
  }
  ```

### Setup Code

- [ ] Create `src/plugins/monaco/renderer/textmateSetup.ts`:
  ```ts
  import { loadWASM } from 'vscode-oniguruma'
  import { Registry } from 'vscode-textmate'
  import { wireTmGrammars } from 'monaco-editor-textmate'
  import onigurumaWasm from 'vscode-oniguruma/release/onig.wasm?url'
  import { grammarMap } from '../grammars/grammarMap'

  export async function setupTextMateGrammars(monacoInstance, editorInstance) {
    await loadWASM(fetch(onigurumaWasm))

    const registry = new Registry({
      onigLib: Promise.resolve({ ... }), // oniguruma adapter
      loadGrammar: async (scopeName) => {
        const entry = Object.values(grammarMap).find(g => g.scopeName === scopeName)
        if (!entry) return null
        const grammar = await import(`../grammars/${entry.file}`)
        return grammar
      }
    })

    const grammars = new Map(
      Object.entries(grammarMap).map(([langId, { scopeName }]) => [langId, scopeName])
    )

    await wireTmGrammars(monacoInstance, registry, grammars, editorInstance)
  }
  ```

- [ ] In `MonacoNode.tsx`, call `setupTextMateGrammars(monaco, editor)` after the editor mounts (in the `onMount` callback)

### Theme Alignment

- [ ] Update the existing `canvaflow-cursor` theme token rules to match VS Code Dark+ more closely
  - The TextMate scope names are more granular than Monaco's built-in scopes
  - Key scopes to get right: `entity.name.function`, `entity.name.type`, `variable.other`, `support.type`, `keyword.control`, `string.quoted`, `comment.line`
  - Reference: VS Code's `dark_plus.json` theme for exact scope→color mappings

### Vite Config

- [ ] Ensure the WASM file is handled correctly by Vite — add to `electron.vite.config.ts` if needed:
  ```ts
  assetsInclude: ['**/*.wasm']
  ```

## Notes

- TextMate grammars are loaded async — there may be a brief flash of Monaco's built-in colors before TM kicks in. This is acceptable.
- Grammar files can be large (100–300KB each). Load only the grammar for the current file's language, not all at once. `wireTmGrammars` handles this lazily.
- The WASM binary for oniguruma is ~650KB. Bundle it via Vite's `?url` import so it's served as a static asset.
