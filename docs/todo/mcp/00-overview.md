# MCP — Canvas Control for Claude

## Goal

Give Claude (running inside a CanvaFlow terminal node) the ability to control the canvas as a tool call. The first use case is: after finishing a task, Claude opens a Monaco editor node pre-navigated to the git tab — so the user can review the diff immediately. Over time, Claude should be able to create, focus, and interact with any node type.

## Why MCP

Claude Code supports MCP (Model Context Protocol) servers configured via `.claude/settings.json`. An MCP server exposes named tools that Claude can call mid-session. This is the standard, supported way to give Claude custom capabilities — no hacks, no parsing stdout.

## What we're NOT doing

- No remote MCP server — everything is local, Unix socket or localhost
- No tool that lets Claude write arbitrary JS into the renderer (security boundary stays intact)
- No LSP, no AI code completion — this is canvas control only

## Architecture

```
Claude (terminal node)
  → tool call: canvaflow_open_editor({ path, tab })
    → MCP server (stdio process, spawned by Electron)
      → Unix socket / localhost → Electron main process
        → IPC → renderer process
          → creates / focuses Monaco node, sets active tab
```

The Electron main process runs a lightweight command server (Unix socket or HTTP on a random port written to a temp file). The MCP server connects to it and translates tool calls into canvas commands.

Because CanvaFlow creates the Claude node, it can auto-inject the MCP config into the workspace's `.claude/settings.json` at node creation time — so the tools are always available without the user doing anything.

## Phases

| # | File | What |
|---|------|------|
| 1 | [01-command-server.md](01-command-server.md) | Electron-side Unix socket server that accepts canvas commands |
| 2 | [02-mcp-server.md](02-mcp-server.md) | MCP server process exposing canvas tools to Claude |
| 3 | [03-auto-inject.md](03-auto-inject.md) | Auto-inject MCP config when a Claude node is created |
| 4 | [04-tools.md](04-tools.md) | Full tool catalog — open editor, create terminal, focus node, etc. |
