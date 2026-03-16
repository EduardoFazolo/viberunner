# 01 — Project Setup

**Status:** TODO
**Depends on:** nothing

## Goal
Bootstrap the Electron + Bun monorepo with TypeScript, Vite, and React. Establish the build pipeline and IPC architecture.

## Tasks

- [ ] Initialize Bun project (`bun init`) with `package.json`
- [ ] Install and configure `electron-vite` as the build tool
- [ ] Set up monorepo structure:
  ```
  src/
    main/        ← Electron main process (Bun/Node APIs)
    preload/     ← Electron preload scripts
    renderer/    ← React SPA (canvas UI)
  ```
- [ ] Configure TypeScript (`tsconfig.json`) for all three targets
- [ ] Add React + ReactDOM via Bun
- [ ] Install and configure **Tailwind CSS v4** (required by shadcn/ui)
- [ ] Initialize **shadcn/ui**: `bunx shadcn@latest init` — choose dark theme, CSS variables, src/renderer path
- [ ] Add base shadcn components used across the whole app: `button`, `tooltip`, `badge`, `separator`
- [ ] Configure Vite for renderer (HMR in dev, bundled in prod)
- [ ] Set up `BrowserWindow` creation in main process with `webPreferences`:
  - `contextIsolation: true`
  - `sandbox: true`
  - `nodeIntegration: false`
  - hardware acceleration enabled (default)
- [ ] Establish typed IPC bridge via preload (`contextBridge.exposeInMainWorld`)
- [ ] Wire up `bun run dev` (electron-vite dev) and `bun run build` (electron-vite build)
- [ ] Configure electron-builder for packaging (macOS, Linux, Windows targets)
- [ ] Add ESLint + Prettier with project conventions
- [ ] Validate: app opens a blank window, HMR works, preload IPC round-trips

## Stack Decisions Locked Here
- **Runtime:** Bun (scripts, build, SQLite)
- **Electron:** Latest stable
- **Build:** electron-vite + Vite 5
- **UI framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui (dark theme, CSS variables)
- **IPC:** typed bridge via contextBridge (no nodeIntegration)
