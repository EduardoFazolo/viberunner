# MCP Phase 4 — Full Tool Catalog

## Goal

Expand the tool set beyond the Phase 2 bootstrap so Claude can meaningfully control the canvas — creating nodes, navigating between them, and reading canvas state.

## Canvas write tools

| Tool | Params | Description |
|------|--------|-------------|
| `canvaflow_open_editor` | `path?, tab?` | Create or focus a Monaco node, optionally at a specific tab (`files`, `git`, `log`) |
| `canvaflow_open_terminal` | `cwd?, title?` | Create a new terminal node at the given path |
| `canvaflow_open_browser` | `url` | Create a browser node pointing at a URL |
| `canvaflow_create_note` | `title, content?` | Create a note node with optional markdown content |
| `canvaflow_focus_node` | `nodeId` | Bring a node to front and animate camera to it |

## Canvas read tools

| Tool | Params | Description |
|------|--------|-------------|
| `canvaflow_get_workspace` | — | Active workspace `{ id, name, path }` |
| `canvaflow_list_nodes` | — | All nodes on the current canvas `[{ id, type, title }]` |

## Notes on tool design

**Keep tools coarse-grained.** One tool call should do something meaningful and visible to the user — not micro-operations. `canvaflow_open_editor` with `tab: "git"` is one call, not "create editor" + "switch tab".

**Write good descriptions.** Claude decides when to call a tool based on the description alone. Be explicit about *when* to use each tool:
- `canvaflow_open_editor`: *"Call this after completing a coding task so the user can review changes. Always pass `tab: 'git'`."*
- `canvaflow_focus_node`: *"Use this to direct the user's attention to a node you just created or modified."*

**Return useful data.** Every write tool should return the created/affected `nodeId` so subsequent tools (like `canvaflow_focus_node`) can reference it.

## Future ideas (not in scope yet)

- `canvaflow_write_to_terminal` — paste text into a specific terminal node (useful for multi-agent setups)
- `canvaflow_take_screenshot` — capture a node's current visual state and return it as a base64 image (for browser nodes especially)
- `canvaflow_arrange_nodes` — reposition nodes on the canvas programmatically
