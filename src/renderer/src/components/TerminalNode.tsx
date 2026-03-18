import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { NodeData } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { useNodeStore } from '../stores/nodeStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { registerTerminal, unregisterTerminal } from '../terminalRegistry'
import { useSettingsStore } from '../stores/settingsStore'
import { normalizeClientPointForElement } from '../utils/terminalMouse'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub
} from './ui/context-menu'
import '@xterm/xterm/css/xterm.css'

interface Props {
  node: NodeData
}

type XtermMouseServiceLike = {
  getCoords?: (...args: any[]) => any
  getMouseReportCoords?: (...args: any[]) => any
}

type XtermSelectionServiceLike = {
  _getMouseEventScrollAmount?: (...args: any[]) => any
}

function patchXtermMouseCoordinates(term: Terminal): () => void {
  // xterm expects pointer coordinates in the terminal's unscaled layout space.
  // Our canvas zoom is a CSS transform, so we normalize mouse input before
  // xterm converts it into cell coordinates for selection and mouse reporting.
  const core = (term as any)?._core as {
    _mouseService?: XtermMouseServiceLike
    _selectionService?: XtermSelectionServiceLike
    screenElement?: HTMLElement
  } | undefined

  const mouseService = core?._mouseService
  if (!mouseService) return () => {}

  const originalGetCoords = mouseService.getCoords?.bind(mouseService)
  const originalGetMouseReportCoords = mouseService.getMouseReportCoords?.bind(mouseService)
  const selectionService = core?._selectionService
  const originalGetMouseEventScrollAmount =
    selectionService?._getMouseEventScrollAmount?.bind(selectionService)

  if (originalGetCoords) {
    mouseService.getCoords = (
      event: { clientX: number; clientY: number },
      element: HTMLElement,
      colCount: number,
      rowCount: number,
      isSelection?: boolean,
    ) => originalGetCoords(
      normalizeClientPointForElement(event, element),
      element,
      colCount,
      rowCount,
      isSelection,
    )
  }

  if (originalGetMouseReportCoords) {
    mouseService.getMouseReportCoords = (
      event: MouseEvent,
      element: HTMLElement,
    ) => originalGetMouseReportCoords(
      normalizeClientPointForElement(event, element),
      element,
    )
  }

  if (selectionService && originalGetMouseEventScrollAmount && core?.screenElement) {
    selectionService._getMouseEventScrollAmount = (event: MouseEvent) =>
      originalGetMouseEventScrollAmount(
        normalizeClientPointForElement(event, core.screenElement!),
      )
  }

  return () => {
    if (originalGetCoords) mouseService.getCoords = originalGetCoords
    if (originalGetMouseReportCoords) mouseService.getMouseReportCoords = originalGetMouseReportCoords
    if (selectionService && originalGetMouseEventScrollAmount) {
      selectionService._getMouseEventScrollAmount = originalGetMouseEventScrollAmount
    }
  }
}

export function TerminalNode({ node }: Props): React.ReactElement {
  const termRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { update, remove, bringToFront, sendToBack, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const focusedNodeIdRef = useRef(focusedNodeId)
  useEffect(() => { focusedNodeIdRef.current = focusedNodeId }, [focusedNodeId])

  useEffect(() => {
    if (!termRef.current) return

    const workspaceId = useWorkspaceStore.getState().activeId || ''

    const { settings: appSettings } = useSettingsStore.getState()

    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize: appSettings.fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 5000,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#a78bfa',
        selectionBackground: '#a78bfa44',
        black: '#1a1a1a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e8e8e8',
        brightBlack: '#404040',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f5',
      },
    })

    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(serializeAddon)
    term.loadAddon(new WebLinksAddon())

    // Try WebGL renderer, fall back to canvas
    const loadRenderer = async () => {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => webglAddon.dispose())
        term.loadAddon(webglAddon)
      } catch {
        const { CanvasAddon } = await import('@xterm/addon-canvas')
        term.loadAddon(new CanvasAddon())
      }
    }

    term.open(termRef.current)
    const restoreMousePatch = patchXtermMouseCoordinates(term)
    fitAddon.fit()
    loadRenderer()

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    serializeAddonRef.current = serializeAddon

    // Register so beforeunload can serialize this terminal synchronously
    registerTerminal(node.id, () => serializeAddonRef.current?.serialize() ?? '')

    // Restore previous scrollback from SQLite (written before tmux output starts)
    const savedState = node.props.serializedState as string | undefined
    if (savedState) {
      term.write(savedState)
    }

    // Start PTY (via tmux if available)
    const cwd = (node.props.cwd as string) || ''
    const shell = (node.props.shell as string) || appSettings.shell
    window.terminal.create(node.id, workspaceId, cwd, shell)

    // PTY → xterm
    const unsub = window.terminal.onData(node.id, (data) => term.write(data))

    // xterm → PTY
    term.onData((data) => window.terminal.write(node.id, data))

    // OSC 7: shell reports CWD as file://hostname/path
    // Most modern shells (zsh+oh-my-zsh, fish, bash with vte) emit this on every cd
    term.parser.registerOscHandler(7, (data) => {
      try {
        const raw = data.startsWith('file://')
          ? decodeURIComponent(new URL(data).pathname)
          : decodeURIComponent(data)
        const parts = raw.split('/').filter(Boolean)
        // Shorten: ~/foo → just show foo, /usr/local/bin → usr/local/bin
        const home = raw.includes('/Users/') || raw.includes('/home/')
        const homeIdx = raw.indexOf('/Users/') >= 0
          ? raw.indexOf('/Users/') : raw.indexOf('/home/')
        const afterHome = homeIdx >= 0
          ? raw.slice(raw.indexOf('/', homeIdx + 1) + 1)
          : null
        const short = afterHome !== null && afterHome !== ''
          ? '~/' + afterHome
          : afterHome === ''
            ? '~'
            : '/' + parts.join('/')
        const current = useNodeStore.getState().nodes.get(node.id)
        useNodeStore.getState().update(node.id, {
          title: short,
          props: { ...current?.props, cwd: raw },  // store full path, not the display-shortened one
        })
      } catch {}
      return false
    })

    // OSC 2: shell / running process sets the window title
    // Fired by most shells and programs (vim, htop, etc.)
    term.onTitleChange((title) => {
      if (!title) return
      const current = useNodeStore.getState().nodes.get(node.id)
      // Only update if it doesn't look like a raw OSC 7 path repeated
      if (!title.startsWith('file://')) {
        useNodeStore.getState().update(node.id, {
          title,
          props: { ...current?.props },
        })
      }
    })

    // Periodically update nodeStore with serialized state so autosave keeps SQLite fresh
    saveTimerRef.current = setInterval(() => {
      if (serializeAddonRef.current) {
        const serializedState = serializeAddonRef.current.serialize()
        const current = useNodeStore.getState().nodes.get(node.id)
        if (current) {
          useNodeStore.getState().update(node.id, { props: { ...current.props, serializedState } })
        }
      }
    }, 5_000)

    return () => {
      unregisterTerminal(node.id)

      // Workspace switch: node is already removed from store, write directly to DB
      if (serializeAddonRef.current) {
        const serializedState = serializeAddonRef.current.serialize()
        window.terminal.saveState(node.id, serializedState)
      }

      if (saveTimerRef.current) clearInterval(saveTimerRef.current)

      unsub()
      restoreMousePatch()
      term.dispose()

      // Kill the tmux session only if the node was explicitly deleted
      const nodeDeleted = !useNodeStore.getState().nodes.has(node.id)
      window.terminal.kill(node.id, workspaceId, nodeDeleted)

      xtermRef.current = null
      fitAddonRef.current = null
      serializeAddonRef.current = null
    }
  }, [node.id])


  // Block wheel events from reaching the canvas only when this terminal is focused.
  // When not focused, the guard overlay intercepts events so this handler never sees them.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (focusedNodeIdRef.current === node.id) e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [node.id])

  // Refit when node size changes
  useEffect(() => {
    if (!fitAddonRef.current || !xtermRef.current) return
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit()
      const { cols, rows } = xtermRef.current!
      window.terminal.resize(node.id, cols, rows)
    }, 50)
    return () => clearTimeout(timer)
  }, [node.width, node.height, node.minimized, node.id])

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <BaseNode node={node}>
          <div
            ref={containerRef}
            style={{ width: '100%', height: node.height - 32, padding: '6px 8px', boxSizing: 'border-box', position: 'relative' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* isolation: isolate contains xterm's internal z-indices so our overlay can sit above them */}
            <div ref={termRef} style={{ width: '100%', height: '100%', isolation: 'isolate' }} />
            {focusedNodeId !== node.id && (
              <div
                style={{ position: 'absolute', inset: 0, zIndex: 9999, cursor: 'text' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setFocusedNodeId(node.id)
                  setTimeout(() => xtermRef.current?.focus(), 0)
                }}
              />
            )}
          </div>
        </BaseNode>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => update(node.id, { minimized: !node.minimized })}>
          {node.minimized ? 'Restore' : 'Minimize'}
        </ContextMenuItem>
        <ContextMenuSub trigger="Order">
          <ContextMenuItem onClick={() => bringToFront(node.id)}>Bring to Front</ContextMenuItem>
          <ContextMenuItem onClick={() => sendToBack(node.id)}>Send to Back</ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => remove(node.id)}>
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
