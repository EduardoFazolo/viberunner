# MCP Phase 2 — MCP Server

## Goal

A small MCP server process that Claude Code connects to via stdio. It exposes CanvaFlow canvas actions as named tools, and sends commands to the Electron command server (Phase 1) to execute them.

## Process model

Claude Code spawns MCP servers as child processes via stdio (stdin/stdout). The MCP server:
1. Reads the socket path from `CANVAFLOW_SOCKET` env var (injected by Electron at Claude node creation)
2. Connects to the Unix socket
3. Handles tool calls from Claude by sending commands over the socket and returning the result

## Location

`src/mcp/canvaflow-mcp.ts` — compiled to a single JS file and shipped with the app.

The path to the compiled binary is what gets written into `.claude/settings.json` (Phase 3).

## Tools (Phase 2 scope)

### `canvaflow_open_editor`
Opens a Monaco editor node on the canvas, optionally pre-navigated to a specific tab.

```json
{
  "name": "canvaflow_open_editor",
  "description": "Opens a code editor node on the canvas. Use tab 'git' after making changes so the user can review the diff. Use tab 'files' to show the file tree.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to the repository root. Defaults to the active workspace path if omitted."
      },
      "tab": {
        "type": "string",
        "enum": ["files", "git", "log"],
        "description": "Which tab to open. Use 'git' to show changed files and diffs."
      }
    }
  }
}
```

### `canvaflow_get_workspace`
Returns the active workspace so Claude knows the repo path without being told.

```json
{
  "name": "canvaflow_get_workspace",
  "description": "Returns the active CanvaFlow workspace name and path.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

## Implementation notes

- Use the official `@modelcontextprotocol/sdk` — `McpServer` + `StdioServerTransport`
- Keep the MCP server stateless: each tool call opens a socket connection, sends one command, reads one response, closes
- No bundled dependencies beyond the MCP SDK and Node built-ins — keep it small
- Tool descriptions should be written from Claude's perspective ("use this when…") — the description is what Claude reads when deciding whether to call it
