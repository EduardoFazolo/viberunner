# 08b — Browser Node Persistence

**Status:** TODO
**Depends on:** 06-browser-node, 08-canvas-persistence

## The Four Layers

Browser persistence is not one problem — it's four, with different mechanisms:

| Layer | What | How | Where stored |
|---|---|---|---|
| **Session data** | Cookies, localStorage, IndexedDB, cache, credentials | Electron `persist:` partition (automatic) | Electron userData/Partitions/ |
| **Current URL** | The URL open when app was closed | SQLite node props | `canvas_nodes.props.url` |
| **Navigation history** | Back/forward stack so those buttons still work | `webContents.navigationHistory` API → SQLite | `canvas_nodes.props` |
| **Page state** | Scroll position, zoom level | `executeJavaScript` capture → SQLite | `canvas_nodes.props` |
| **sessionStorage** | Auth tokens, SPA state, form progress | `executeJavaScript` capture → encrypted → SQLite | `canvas_nodes.props.sessionStorageEncrypted` |

---

## Layer 1: Session Data (Electron Partition — Automatic)

Electron's `persist:` partitions automatically persist to disk:
- Cookies
- `localStorage` / `sessionStorage`*
- IndexedDB
- HTTP cache
- Service workers
- Saved credentials
- WebSQL

Storage path: `app.getPath('userData')/Partitions/<partition-name>/`

*`sessionStorage` is intentionally NOT persisted — it's scoped to the browsing context lifetime, same as in a real browser. This is correct behavior.

### Partition Strategy: Per-Workspace

The current plan (`persist:canvaflow-browser` shared) has a problem: all browser nodes across all workspaces share the same login state, cache, and cookies.

**Better approach: per-workspace partition.**

```
partition="persist:canvaflow-ws-<workspaceId>"
```

- All browser nodes within a workspace share cookies/login state (natural — you're logged into GitHub in your "work" workspace)
- Different workspaces are isolated (your "personal" workspace doesn't share sessions with "work")
- Matches how developers actually think about projects

**Per-node isolation (opt-in):** For cases where you want two browser nodes in the same workspace to be logged into different accounts (e.g., two different GitHub accounts), add a node-level setting: "Isolated session" which uses `persist:canvaflow-node-<nodeId>`.

### Tasks
- [ ] Change partition from `persist:canvaflow-browser` to `persist:canvaflow-ws-${workspaceId}` (dynamic, per-workspace)
- [ ] Store partition name in `canvas_nodes.props.partition` (so it's stable even if the node moves to another workspace)
- [ ] Add "Isolated session" toggle in node context menu (uses `persist:canvaflow-node-${nodeId}`)
- [ ] On workspace delete: call `session.fromPartition(name).clearStorageData()` to clean up disk space (with user confirmation)

---

## Layer 2: Current URL (SQLite)

Already planned in `08-canvas-persistence.md` via `canvas_nodes.props.url`.

Make sure:
- [ ] URL is saved on every `did-navigate` and `did-navigate-in-page` event (debounced 500ms)
- [ ] On mount: load `props.url` and set as initial `<webview src>`
- [ ] Handle `about:blank` gracefully (no save needed)

---

## Layer 3: Navigation History

Electron 29+ exposes `webContents.navigationHistory`:
- `getEntries()` → `NavigationEntry[]` → `{ url: string, title: string }`
- `getActiveIndex()` → current position in the stack
- `canGoBack()` / `canGoForward()`
- `goToIndex(n)` → navigate to specific history entry

This means we can serialize the full back/forward stack to SQLite and restore it.

**Restoration limitation:** We cannot inject history entries back into the webview's native history stack (browser security). Instead:
- Store entries in SQLite as our own "soft history" array
- On restore: navigate to the saved current URL (the page loads fresh)
- Back/forward buttons use our soft history array (navigate by setting `<webview src>` to the target URL)
- This is identical to how most "restore session" features work in real browsers

### Tasks
- [ ] Access `webContents.navigationHistory` via IPC: new handler `browser:getHistory(nodeId)` → main process reads from the webview's WebContents
- [ ] On `did-navigate`: capture updated history via `navigationHistory.getEntries()` + `getActiveIndex()`
- [ ] Debounced save (500ms) to SQLite: `canvas_nodes.props.navigationHistory` (JSON array) + `props.historyIndex`
- [ ] Schema addition to `canvas_nodes.props` for browser nodes:
  ```json
  {
    "url": "https://github.com",
    "partition": "persist:canvaflow-ws-abc123",
    "navigationHistory": [
      { "url": "https://google.com", "title": "Google" },
      { "url": "https://github.com", "title": "GitHub" }
    ],
    "historyIndex": 1,
    "scrollX": 0,
    "scrollY": 340,
    "zoomFactor": 1.0
  }
  ```
- [ ] On mount/reattach: hydrate `BrowserNode` back/forward state from `props.navigationHistory`
- [ ] Back button: decrement our index, set `<webview src>` to that history entry's URL
- [ ] Forward button: increment our index
- [ ] Cap history at 50 entries (trim oldest) to keep SQLite props lean

---

## Layer 4: Page State (Scroll + Zoom)

### Scroll Position
- [ ] On `did-stop-loading`: capture scroll position via `webview.executeJavaScript('({x: window.scrollX, y: window.scrollY})')`
- [ ] Save to `props.scrollX` / `props.scrollY` (debounced, or on app quit)
- [ ] On restore: after `did-stop-loading` fires (page loaded), inject: `webview.executeJavaScript('window.scrollTo(${x}, ${y})')`

### Zoom Factor
- [ ] On node mount: call `webview.setZoomFactor(props.zoomFactor ?? 1.0)`
- [ ] On `zoom-changed` event: save new zoom factor to `props.zoomFactor`
- [ ] Note: this is the in-page zoom (Cmd+/- inside the browser), separate from canvas zoom

---

---

## Layer 5: sessionStorage

The Web spec says sessionStorage is ephemeral — but that's the spec for browsers. CanvaFlow is a workspace restore tool, and Chrome/Firefox both restore sessionStorage on session restore for exactly this reason. We should too.

**Why it matters:** Many apps store auth tokens, in-progress form state, wizard steps, and SPA routing state in sessionStorage. Losing it on relaunch means users get logged out, lose unsaved work, or land on the wrong page.

**How to capture it** (on app `before-quit`, for each browser node):
```js
webview.executeJavaScript(
  'JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))'
)
```

**How to restore it** (after `did-stop-loading` on relaunch):
```js
webview.executeJavaScript(`
  const data = ${JSON.stringify(saved)};
  Object.entries(data).forEach(([k, v]) => sessionStorage.setItem(k, v));
`)
```

**Security:** sessionStorage can contain auth tokens. Do NOT store it in plain SQLite alongside everything else. Options:
- Use Electron's `safeStorage` API (`safeStorage.encryptString`) to encrypt the blob before writing to SQLite — decrypts only on the same machine/user (OS keychain-backed)
- This is the same approach password managers take

### Tasks
- [ ] On `before-quit`: for each browser node, call `executeJavaScript` to capture sessionStorage as JSON string
- [ ] Encrypt the captured string with `safeStorage.encryptString()` before saving
- [ ] Store encrypted blob in `canvas_nodes.props.sessionStorageEncrypted` (base64)
- [ ] On node mount / page load (`did-stop-loading`): if `sessionStorageEncrypted` exists:
  1. Decrypt with `safeStorage.decryptString()`
  2. Inject via `executeJavaScript` to restore all key/value pairs
  3. Only inject if the URL origin matches the origin the sessionStorage was captured from (prevent cross-origin injection)
- [ ] Clear `sessionStorageEncrypted` from SQLite after successful inject (it's now live in the page — no need to keep the stale copy)
- [ ] If capture fails (e.g., CSP blocks executeJavaScript): silently skip, do not crash

---

## What Is NOT Persisted (By Design)

| Thing | Why not |
|---|---|
| In-memory JS/SPA state | No API access beyond URL + storage; page reloads |
| WebRTC streams | Not meaningful to persist |
| Open DevTools | Not worth the complexity |
| Pinch-zoom of page content | Too ephemeral |

---

## Acceptance Criteria
- Log into GitHub in a browser node → quit app → relaunch → still logged in
- Navigate through 5 pages → quit → relaunch → current page restored, back button works through soft history
- Scroll halfway down a page → quit → relaunch → scroll position restored
- Two workspaces have separate browser sessions (can be logged into different accounts)
- Deleting a workspace offers to clear its browser session data
