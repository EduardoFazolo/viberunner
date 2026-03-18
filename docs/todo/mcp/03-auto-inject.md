# MCP Phase 3 — Auto-inject MCP Config

## Goal

When a Claude node is created inside CanvaFlow, automatically configure Claude Code to use the CanvaFlow MCP server — without the user doing anything manually.

## How Claude Code finds MCP servers

Claude Code reads MCP server config from `.claude/settings.json` in the working directory (or parent directories). The relevant section:

```json
{
  "mcpServers": {
    "canvaflow": {
      "command": "/path/to/canvaflow-mcp",
      "args": [],
      "env": {
        "CANVAFLOW_SOCKET": "/tmp/canvaflow-<workspaceId>.sock"
      }
    }
  }
}
```

## What to do at Claude node creation time

In `CanvasContextMenu.tsx` and `useKeyboardShortcuts.ts`, when adding a `claude` node:

1. Get the workspace path (`getActiveWorkspace()?.path`)
2. Call a new IPC handler `mcp:injectConfig` with the workspace path and socket path
3. In the main process: read the existing `.claude/settings.json` (if any), merge in the `canvaflow` MCP entry, write it back
4. Do not overwrite other MCP servers the user may have configured — merge carefully

## Concerns

**Don't clobber user config.** Read → merge → write. Never replace the whole file. If `.claude/settings.json` already has a `canvaflow` entry, update only the `env.CANVAFLOW_SOCKET` (the socket path changes per workspace).

**Path to the MCP binary.** At build time, the MCP server is compiled and bundled inside the `.app`. The main process knows its own `process.resourcesPath`, so it can resolve the binary path reliably. Use `app.getPath('exe')` or `process.resourcesPath` — do not hardcode.

**The socket env var.** The `CANVAFLOW_SOCKET` path must match what Phase 1 actually starts. Tie them together: the main process generates the socket path when activating a workspace and passes the same path to both the server start and the config injection.

**Gitignore.** After writing `.claude/settings.json`, also ensure `.claude/` is in the project's `.gitignore` — or at minimum, don't write anything sensitive. The injected config only contains the binary path and socket path, both of which are machine-local and safe to gitignore.
