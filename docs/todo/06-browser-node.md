# 06 — Browser Node

**Status:** TODO
**Depends on:** 04-context-menu
**Persistence:** See `08b-browser-persistence.md`

## Goal
Embed a live, interactive browser window inside a canvas node using Electron's `<webview>` tag. Users can navigate URLs, interact with pages, and use the browser fully within the canvas.

## Why `<webview>` over WebContentsView
`WebContentsView` (main process) positions views at fixed screen coordinates — it cannot be transformed with CSS and therefore cannot participate in canvas pan/zoom. `<webview>` is a DOM element that lives in the renderer and can be scaled/translated with the rest of the canvas overlay. This is the correct choice for in-canvas embedding.

**Tradeoff:** `<webview>` requires `webviewTag: true` in `webPreferences` (slightly larger attack surface). Mitigate with `partition`, `nodeintegration: false`, and strict `allowpopups: false`.

## Tasks

### Electron Config
- [ ] Enable `webviewTag: true` in main BrowserWindow `webPreferences`
- [ ] Set `nodeintegration="false"` and `nodeintegrationinsubframes="false"` on every webview
- [ ] Create a dedicated `webview` partition (isolated session storage)

### BrowserNode Component
- [ ] `bunx shadcn@latest add input button tooltip`
- [ ] `<BrowserNode>` extends `<BaseNode>`
- [ ] Content area contains:
  - Toolbar: navigation buttons + URL bar
  - `<webview>` filling remaining space
- [ ] Toolbar uses shadcn `Button` variant=`"ghost"` size=`"icon"` for back, forward, reload, stop
- [ ] URL bar: shadcn `Input` — shows current URL, updates on `did-navigate` / `did-navigate-in-page` events
- [ ] Wrap each toolbar button in shadcn `Tooltip` for labels
- [ ] Initial URL from `node.props.url` (default: `about:blank`)
- [ ] `<webview>` attributes:
  - `src={url}`
  - `partition="persist:canvaflow-browser"`
  - `allowpopups={false}`
  - `disablewebsecurity={false}` (keep security on)
- [ ] URL bar submit (Enter key): sets `<webview>` src

### Webview Events
- [ ] `did-start-loading` → show loading indicator in title bar
- [ ] `did-stop-loading` → hide loading indicator, update URL bar
- [ ] `did-fail-load` → show error state in node
- [ ] `page-title-updated` → update node title
- [ ] `new-window` → open new BrowserNode on canvas at offset position (instead of spawning native window)

### Zoom Interaction
- [ ] When canvas zoom < ~0.3, show a static thumbnail/screenshot of the webview instead of live content (performance: avoid rendering full webview when tiny)
- [ ] `<webview>.capturePage()` for thumbnails at low zoom
- [ ] Threshold: if `zoom < 0.3`, render `<img src={thumbnail}>` instead of live webview
- [ ] Above threshold: render live webview

### Input Blocking
- [ ] When canvas is in pan mode (space held), `pointer-events: none` on all webviews to allow canvas drag through them

## Acceptance Criteria
- Right-click canvas → "New Browser" opens a browser node
- Can type a URL and navigate
- Page title updates node title
- Back/forward/reload work
- At low zoom, shows thumbnail instead of live webview
