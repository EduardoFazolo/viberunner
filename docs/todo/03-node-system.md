# 03 — Node System

**Status:** TODO
**Depends on:** 02-canvas-foundation

## Goal
Implement the base node abstraction: a draggable, resizable card on the canvas. All content types (terminal, browser, note) are specializations of this base node.

## Architecture

Nodes live in `CanvasOverlay` (the DOM layer). Each node is positioned in **world space** (not screen space). The DOM transform handles the visual mapping.

```
NodeStore (Zustand)
  nodes: Map<id, NodeData>
    id, type, x, y, width, height, zIndex, title, ...typeSpecificProps
```

## Tasks

### Node Data Model
- [ ] Define `NodeData` type:
  ```ts
  type NodeData = {
    id: string
    type: 'terminal' | 'browser' | 'note'
    x: number      // world space
    y: number      // world space
    width: number  // world space
    height: number // world space
    zIndex: number
    title: string
    minimized: boolean
  }
  ```
- [ ] Create `useNodeStore` (Zustand) with actions: `add`, `remove`, `update`, `bringToFront`

### Base Node Component
- [ ] Add shadcn components: `bunx shadcn@latest add card button tooltip`
- [ ] `<BaseNode>` built on shadcn `Card` (`CardHeader` as title bar, `CardContent` as body)
- [ ] Title bar buttons (close, minimize) → shadcn `Button` variant=`"ghost"` size=`"icon"` with shadcn `Tooltip`
- [ ] Node drag: pointer capture on `CardHeader`, update `node.x/y` in world coords
  - Convert pointer delta from screen space to world space (divide by zoom)
- [ ] Bring to front on click (update zIndex to `max + 1`)
- [ ] Minimized state: hide `CardContent`, collapse to `CardHeader` only

### Node Resize
- [ ] Resize handles on all 8 edges/corners (CSS resize or custom handles)
- [ ] Min size: 200×150px in world space
- [ ] Resize updates `node.width/height` in store
- [ ] Resize respects zoom (delta / zoom)

### Viewport Culling
- [ ] Compute visible world rect from camera: `{ x, y, w, h }` in world space
- [ ] `useVisibleNodes` hook: returns only nodes whose bounding box intersects the viewport
- [ ] Add padding (e.g., 200px in world space) to avoid pop-in during fast pans
- [ ] Only render visible nodes in DOM — unmount off-screen nodes

### Node Placeholder (for culled nodes)
- [ ] When a node is culled but still exists, keep a lightweight sentinel (no content, just data) so layout is preserved
- [ ] Re-mount node content when it enters the viewport

## Acceptance Criteria
- Can create multiple nodes, drag them, resize them
- Nodes not in viewport are not in the DOM
- Bringing to front works correctly with overlapping nodes
- Drag/resize feels snappy at all zoom levels
