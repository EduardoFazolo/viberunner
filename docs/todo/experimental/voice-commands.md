# Voice Commands (Jarvis-style)

Hands-free workspace control via voice. Goal: feel like Iron Man's Jarvis — say intent, workspace responds immediately.

## Use cases
- "Show me all windows" → zoom out to fit all nodes
- "Organize windows" → auto-arrange by most used
- "Show currently active agents" → filter/highlight agent nodes
- "Show me X from another workflow" → search across workspaces and navigate
- "Open a terminal" / "Open a browser" → spawn nodes
- "Focus the Claude window" → bring node to front
- "Switch to workflow X" → workspace switch

---

## Stack

- **STT:** [Handy](https://github.com/cjpais/Handy) (Whisper, runs in main process)
- **LLM:** Claude Sonnet (streaming) — intent is too fuzzy for a small local model
- **Interface:** MCP server in main process exposing workspace read/write to the agent
- **Trigger:** Push-to-talk hotkey (e.g. Cmd+Shift+V) — no always-on mic

---

## Implementation phases

### Phase 1 — Node metadata (prerequisite for everything)
- [ ] Add `lastFocusedAt: number` timestamp to `NodeData`
- [ ] Add `focusCount: number` to `NodeData` (increment on each focus)
- [ ] Add `tags: string[]` to `NodeData` (optional, user-defined)
- [ ] Persist metadata through workspace save/load
- [ ] Update `focusedNodeId` setter to write metadata on every focus

### Phase 2 — STT integration
- [ ] Integrate Handy in the main process
- [ ] Expose push-to-talk IPC: `voice:start`, `voice:stop`, `voice:transcript`
- [ ] Add global hotkey (Cmd+Shift+V hold to record, release to transcribe)
- [ ] Visual indicator in canvas when mic is active (small pulse/badge)
- [ ] Audio feedback: click on activation, chime on transcript received

### Phase 3 — MCP server (workspace read/write)
- [ ] Scaffold a local MCP server in `src/main/mcp/`
- [ ] Expose read tools:
  - `listNodes(workspaceId?)` — all nodes with metadata
  - `listWorkspaces()` — all workspaces
  - `getCamera()` — current pan/zoom
- [ ] Expose write tools:
  - `focusNode(id)` — bring to front + set focused
  - `openNode(type, props?)` — spawn new node
  - `removeNode(id)`
  - `setCamera(x, y, zoom)` — pan/zoom programmatically
  - `switchWorkspace(id)`
  - `arrangeNodes(strategy)` — layout algorithms (grid, by usage, by type)
- [ ] Wire MCP server to Zustand stores via IPC

### Phase 4 — Agent + streaming actions
- [ ] On transcript received: send to Claude with workspace context snapshot
- [ ] Stream response; parse action calls as they arrive
- [ ] Dispatch actions to MCP server as they stream (don't wait for full response)
- [ ] Handle multi-step responses ("first zoom out, then highlight X")
- [ ] System prompt: describe available tools, current workspace state, user's mental model

### Phase 5 — UX polish
- [ ] "Thinking" visual state between transcript and first action
- [ ] Show transcript text briefly as overlay (confirms what was heard)
- [ ] Undo last voice command (Cmd+Z should work naturally if actions go through normal store)
- [ ] Error handling: "I didn't understand that" fallback with what was heard

---

## Open questions
- Pronoun resolution ("this thing", "that workflow") — needs conversation history or visual context
- How to describe node semantic meaning to the agent (node title + type is probably enough to start)
- Whether to keep a rolling voice session context or treat each utterance as stateless
- Arrange algorithms: grid, cluster by type, sort by recency, sort by focus count
