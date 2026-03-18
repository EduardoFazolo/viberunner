# MCP Phase 1 — Canvas Command Server

## Goal

Run a lightweight server inside the Electron main process that listens for canvas commands from the MCP server. Acts as the bridge between the external MCP process and the renderer.

## Transport

Use a **Unix domain socket** at a predictable temp path, e.g. `/tmp/canvaflow-<workspaceId>.sock`.

- Faster and more secure than localhost HTTP (no port conflicts, no firewall, no accidental exposure)
- The socket path is written to an env var (`CANVAFLOW_SOCKET`) that gets injected into the Claude terminal's environment, so the MCP server can find it without any config
- On Windows, fall back to a named pipe (`\\.\pipe\canvaflow-<workspaceId>`)

## Protocol

Simple newline-delimited JSON over the socket. Each message is one JSON object per line:

**Request** (MCP server → Electron):
```json
{ "id": "abc123", "command": "open_editor", "params": { "path": "/repo", "tab": "git" } }
```

**Response** (Electron → MCP server):
```json
{ "id": "abc123", "ok": true, "result": { "nodeId": "node_xyz" } }
{ "id": "abc123", "ok": false, "error": "No active workspace" }
```

## Commands to implement (Phase 1)

| Command | Params | What it does |
|---------|--------|--------------|
| `open_editor` | `path: string, tab?: "files" \| "git" \| "log"` | Creates a Monaco node for the given path (or focuses an existing one) and switches to the specified tab |
| `focus_node` | `nodeId: string` | Brings a node to front and centers camera on it |
| `get_workspace` | — | Returns the active workspace `{ id, name, path }` |

## Implementation notes

- Start the server when a workspace is activated, stop it when the workspace is deactivated
- Renderer → main IPC (`canvas:command`) carries the parsed command to the renderer store
- The renderer handles `open_editor` by calling `useNodeStore.getState().add('monaco', ...)` with the right `rootPath` and `activeTab` props — same as how Monaco nodes are created today from the context menu
- Keep the server module isolated in `src/main/canvasServer.ts` — no business logic there, just parse → relay → respond
