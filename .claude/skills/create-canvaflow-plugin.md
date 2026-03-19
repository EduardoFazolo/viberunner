# Skill: Create CanvaFlow Plugin

You are helping the user scaffold a new plugin for the CanvaFlow infinite canvas app. Follow these steps exactly.

## 1. Gather requirements

If the user hasn't provided all of the following, ask before writing any code:

- **Plugin ID** — URL-safe, lowercase, no spaces (e.g. `myplugin`)
- **What it does** — brief description
- **Default size** — width × height in pixels (suggest 600×400 if unsure)
- **Keyboard shortcut** — optional (e.g. `Meta+Shift+M`)
- **Needs IPC?** — does the plugin need to talk to the main process (file system, external APIs, native calls)?
- **Needs a webview?** — does it embed a `<webview>` (external website or Electron webview)?

## 2. Create the files

### Always create

**`src/plugins/<id>/index.ts`** — renderer manifest

```ts
import { <Id>Node } from './renderer/<Id>Node'
import type { CanvaFlowPlugin } from '../types'

export const <id>Plugin: CanvaFlowPlugin = {
  id: '<id>',
  nodeType: '<id>',
  defaultSize: { width: <width>, height: <height> },
  defaultTitle: '<Title>',
  component: <Id>Node,
  sidebarLabel: '<Label>',
  // shortcut: 'Meta+Shift+X',  // uncomment if needed
  keepAlive: false,              // set true if the node has long-running state
}
```

> CRITICAL: `index.ts` must never import from `main/` or any Node.js/Electron module. It runs in the browser context.

**`src/plugins/<id>/renderer/<Id>Node.tsx`** — React component

```tsx
import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'

interface Props {
  node: NodeData
}

export function <Id>Node({ node }: Props): React.ReactElement {
  return (
    <BaseNode node={node}>
      {/* plugin content */}
    </BaseNode>
  )
}
```

Use relative imports only — `@renderer` aliases do not resolve inside `src/plugins/`.

### Create if IPC is needed

**`src/plugins/<id>/main/handlers.ts`**

```ts
import type { IpcMainLike } from '../../types'

export function register<Id>Handlers(ipc: IpcMainLike): void {
  ipc.handle('<id>:action', async (_event, arg: unknown) => {
    // implementation
  })
}
```

### Create if webview preload is needed

**`src/plugins/<id>/preload/<id>Webview.ts`**

```ts
import { ipcRenderer } from 'electron'

// Script injected into the <webview>. Runs in the webview's context.
// Use ipcRenderer.sendToHost(...) to communicate with the renderer.
```

## 3. Wire everything up

### Always — register in renderer entry

Edit **`src/renderer/src/main.tsx`**, add two lines:

```ts
import { <id>Plugin } from '../../plugins/<id>'
pluginRegistry.register(<id>Plugin)
```

### If IPC — wire handlers in main process

Edit **`src/main/index.ts`**, inside `app.whenReady()`:

```ts
import { register<Id>Handlers } from '../plugins/<id>/main/handlers'
register<Id>Handlers(ipcMain)
```

Edit **`src/preload/index.ts`**, add to the `api` object:

```ts
<id>: {
  action: (arg: unknown): Promise<unknown> =>
    ipcRenderer.invoke('<id>:action', arg),
},
```

Edit **`src/renderer/src/types/window.d.ts`**, add to `Window['api']`:

```ts
<id>: {
  action: (arg: unknown) => Promise<unknown>
}
```

### If webview preload — add build entry

Edit **`electron.vite.config.ts`**, add to `preload.build.rollupOptions.input`:

```ts
<id>Webview: 'src/plugins/<id>/preload/<id>Webview.ts',
```

Resolve the compiled path from the main handler at runtime:

```ts
import { join } from 'path'
const preloadPath = join(__dirname, '../preload/<id>Webview.js')
```

Return it to the renderer via an IPC call so the component can set `<webview preload={path}>`.

## 4. Useful patterns

### Reading / mutating nodes

```ts
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'

const addNode = useNodeStore(s => s.addNode)
const updateNode = useNodeStore(s => s.updateNode)
```

### Canvas coordinate transforms

```ts
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'

const camera = useCameraStore(s => s.camera)
const worldX = (clientX - camera.x) / camera.zoom
const worldY = (clientY - camera.y) / camera.zoom
```

### Drag from webview onto canvas

```ts
import { useCanvasDrag } from '../../../renderer/src/hooks/useCanvasDrag'
import { createPortal } from 'react-dom'

const { isDragging, ghostX, ghostY, startDrag, nudge, cancel } = useCanvasDrag({
  onDrop(clientX, clientY) {
    const { camera } = useCameraStore.getState()
    const worldX = (clientX - camera.x) / camera.zoom
    const worldY = (clientY - camera.y) / camera.zoom
    // addNode(...)
  },
})

// Render ghost via portal:
{isDragging && createPortal(
  <div style={{ position: 'fixed', left: ghostX - 60, top: ghostY - 16, pointerEvents: 'none' }}>
    Drop here
  </div>,
  document.body,
)}
```

The webview preload sends cursor deltas:

```ts
ipcRenderer.sendToHost('drag:move', { dx, dy })
```

The component calls `nudge(dx, dy)` in the `ipc-message` handler on the `<webview>` element.

## 5. Final checklist

Before handing back to the user, confirm every item below is done:

- [ ] `src/plugins/<id>/index.ts` — no Node.js/Electron imports
- [ ] `src/plugins/<id>/renderer/<Id>Node.tsx` — uses `BaseNode`, relative imports
- [ ] `src/renderer/src/main.tsx` — plugin registered
- [ ] `src/main/index.ts` — IPC handlers registered (if needed)
- [ ] `src/preload/index.ts` — bridge methods added (if needed)
- [ ] `src/renderer/src/types/window.d.ts` — types added (if needed)
- [ ] `electron.vite.config.ts` — preload entry added (if webview needed)
- [ ] Run `bun run build` and confirm no renderer-bundle errors
