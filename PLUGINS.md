# CanvaFlow Plugin System

Plugins are compile-time modules that add new node types to the canvas. Each plugin is self-contained: it ships its own React component, IPC handlers, and (optionally) a webview preload script. Adding or removing a plugin means editing two import lines — one in the renderer entry, one in the main process entry.

> **Scope**: Terminal and Browser nodes are **not** plugins. They are built-in node types with deep integration. The plugin system is for self-contained embeds like Notion.

---

## Directory layout

```
src/plugins/
  types.ts                   ← CanvaFlowPlugin interface + PluginRegistry singleton
  notion/
    index.ts                 ← renderer manifest (NO Node.js/Electron imports)
    renderer/
      NotionNode.tsx          ← React component
    utils/
      notionDrag.ts
      notionToTiptap.ts
    main/
      handlers.ts             ← IPC handlers (main process only)
      notionExport.ts
      notionWindow.ts
    preload/
      notionWebview.ts        ← webview preload script
```

Follow this structure for every new plugin:

```
src/plugins/<id>/
  index.ts         ← renderer manifest
  renderer/
    <Id>Node.tsx   ← React component
  main/
    handlers.ts    ← IPC handlers (optional)
  preload/
    <id>Webview.ts ← webview preload (optional)
```

---

## Step 1 — Implement `CanvaFlowPlugin`

Create `src/plugins/myplugin/index.ts`:

```ts
import { MyPluginNode } from './renderer/MyPluginNode'
import type { CanvaFlowPlugin } from '../types'

export const myPlugin: CanvaFlowPlugin = {
  id: 'myplugin',           // unique, URL-safe, no spaces
  nodeType: 'myplugin',     // stored in NodeData.type and SQLite
  defaultSize: { width: 600, height: 400 },
  defaultTitle: 'My Plugin',
  component: MyPluginNode,
  sidebarLabel: 'My Plugin',
  shortcut: 'Meta+Shift+M', // optional
}
```

**Critical**: `index.ts` must **not** import anything from `main/handlers.ts` or any Node.js/Electron module. It is bundled by the renderer Vite build, which runs in a browser context.

---

## Step 2 — Build the React component

Create `src/plugins/myplugin/renderer/MyPluginNode.tsx`:

```tsx
import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'

interface Props {
  node: NodeData
}

export function MyPluginNode({ node }: Props): React.ReactElement {
  return (
    <BaseNode node={node}>
      {/* your content here */}
      <div style={{ padding: 16 }}>Hello from {node.title}</div>
    </BaseNode>
  )
}
```

`BaseNode` gives you the title bar, resize handles, and focus ring for free. Your content goes inside it.

### Useful stores and hooks

| Import | What it gives you |
|--------|-------------------|
| `useNodeStore` from `../../../renderer/src/stores/nodeStore` | Add, remove, update nodes; get focused node |
| `useCameraStore` from `../../../renderer/src/stores/cameraStore` | Current camera (zoom, pan); `screenToWorld` / `worldToScreen` utils |
| `useCanvasDrag` from `../../../renderer/src/hooks/useCanvasDrag` | Drag-and-drop ghost UI (see below) |
| `useSessionStore` from `../../../renderer/src/stores/sessionStore` | Browser session management (for webview-based plugins) |

Always use **relative paths** from inside `src/plugins/<id>/` — e.g. `../../../renderer/src/stores/nodeStore`. Do not use `@renderer` aliases; they only resolve inside `src/renderer/src/`.

---

## Step 3 — Register in the renderer entry

Open `src/renderer/src/main.tsx` and add two lines:

```ts
import { pluginRegistry } from '../../plugins/types'
import { myPlugin } from '../../plugins/myplugin'  // add this

pluginRegistry.register(notionPlugin)
pluginRegistry.register(myPlugin)               // add this
```

`NodeLayer.tsx` already calls `pluginRegistry.get(node.type)` for every node on the canvas, so your component will render automatically once registered.

---

## Step 4 — Add IPC handlers (optional)

If your plugin needs to talk to the main process, create `src/plugins/myplugin/main/handlers.ts`:

```ts
import type { IpcMainLike } from '../../types'

export function registerMyPluginHandlers(ipc: IpcMainLike): void {
  ipc.handle('myplugin:doSomething', async (_event, arg: string) => {
    return `result for ${arg}`
  })
}
```

Use `IpcMainLike` (not Electron's `IpcMain` directly) so the type can be referenced without pulling Electron into the renderer bundle.

Then wire it up in `src/main/index.ts`:

```ts
import { registerMyPluginHandlers } from '../plugins/myplugin/main/handlers'

// inside app.whenReady():
registerMyPluginHandlers(ipcMain)
```

Expose the handler in the preload bridge at `src/preload/index.ts`:

```ts
myplugin: {
  doSomething: (arg: string): Promise<string> =>
    ipcRenderer.invoke('myplugin:doSomething', arg),
},
```

And add the type to `src/renderer/src/types/window.d.ts`:

```ts
myplugin: {
  doSomething: (arg: string) => Promise<string>
}
```

Call it from your component:

```ts
const result = await window.api.myplugin.doSomething('hello')
```

---

## Step 5 — Add a webview preload script (optional)

If your plugin renders a `<webview>` and needs to inject a script into it:

1. Create `src/plugins/myplugin/preload/mypluginWebview.ts`.

2. Register it in `electron.vite.config.ts`:

```ts
preload: {
  build: {
    rollupOptions: {
      input: {
        index: 'src/preload/index.ts',
        notionWebview: 'src/plugins/notion/preload/notionWebview.ts',
        mypluginWebview: 'src/plugins/myplugin/preload/mypluginWebview.ts',  // add
      }
    }
  }
}
```

3. From your main-process handler, resolve the compiled path:

```ts
import { join } from 'path'
// __dirname is out/main at runtime
const preloadPath = join(__dirname, '../preload/mypluginWebview.js')
```

4. Return it to the renderer via an IPC call (see how `app:notionPreloadPath` works in `src/plugins/notion/main/handlers.ts`).

---

## Using `useCanvasDrag`

`useCanvasDrag` handles the ghost-element UI and pointer listeners for drag interactions that need to cross a webview boundary.

```tsx
import { useCanvasDrag } from '../../../renderer/src/hooks/useCanvasDrag'

const { isDragging, ghostX, ghostY, startDrag, nudge, cancel } = useCanvasDrag({
  onDrop(clientX, clientY) {
    // Called on pointerup. Convert screen coords to canvas world coords:
    const { camera } = useCameraStore.getState()
    const worldX = (clientX - camera.x) / camera.zoom
    const worldY = (clientY - camera.y) / camera.zoom
    // … create a node at (worldX, worldY)
  },
})
```

| API | When to use |
|-----|-------------|
| `startDrag()` | User begins dragging something (e.g. mousedown on a list item) |
| `nudge(dx, dy)` | Webview `ipc-message` with cursor delta — shifts the ghost when the pointer is inside a webview that doesn't fire host pointer events |
| `cancel()` | Drag was aborted (e.g. Escape key, drag left the valid zone) |
| `isDragging` | Whether a drag is active — use to show/hide the ghost |
| `ghostX, ghostY` | Current viewport coordinates for the ghost element |

Render the ghost with a portal so it floats above everything:

```tsx
import { createPortal } from 'react-dom'

{isDragging && createPortal(
  <div style={{
    position: 'fixed',
    left: ghostX - 60,
    top: ghostY - 16,
    pointerEvents: 'none',
    // … your ghost styles
  }}>
    Dragging…
  </div>,
  document.body,
)}
```

---

## The `PluginRegistry`

The singleton at `src/plugins/types.ts` is the only coupling point between the plugin system and the rest of the app.

```ts
import { pluginRegistry } from './plugins/types'

// Register
pluginRegistry.register(myPlugin)       // throws on duplicate nodeType

// Look up
const plugin = pluginRegistry.get('myplugin')  // → CanvaFlowPlugin | undefined

// Iterate
for (const plugin of pluginRegistry.getAll()) { ... }

// Main process — call all registerMainHandlers at once (alternative to calling individually)
pluginRegistry.registerAllMainHandlers(ipcMain)
```

---

## Checklist for a new plugin

- [ ] `src/plugins/<id>/index.ts` — renderer manifest, implements `CanvaFlowPlugin`
- [ ] `src/plugins/<id>/renderer/<Id>Node.tsx` — React component using `BaseNode`
- [ ] `src/renderer/src/main.tsx` — `pluginRegistry.register(myPlugin)`
- [ ] `src/main/index.ts` — `registerMyPluginHandlers(ipcMain)` (if IPC needed)
- [ ] `src/preload/index.ts` + `window.d.ts` — preload bridge (if IPC needed)
- [ ] `electron.vite.config.ts` — preload entry (if webview preload needed)
- [ ] Confirm `index.ts` has **no** Node.js/Electron imports (run `bun run build` to verify)
