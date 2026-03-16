import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { NodeData } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { useNodeStore } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub
} from './ui/context-menu'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    terminal: {
      create: (id: string, cwd: string, shell: string) => Promise<void>
      write: (id: string, data: string) => void
      resize: (id: string, cols: number, rows: number) => void
      kill: (id: string) => Promise<void>
      onData: (id: string, cb: (data: string) => void) => () => void
    }
  }
}

interface Props {
  node: NodeData
}

export function TerminalNode({ node }: Props): React.ReactElement {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const { update, remove, bringToFront, sendToBack } = useNodeStore()

  useEffect(() => {
    if (!termRef.current) return

    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 1000,
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
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    // Try WebGL renderer, fall back to canvas
    const loadRenderer = async () => {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => webglAddon.dispose())
        term.loadAddon(webglAddon)
        console.log('[terminal] WebGL renderer active')
      } catch {
        const { CanvasAddon } = await import('@xterm/addon-canvas')
        term.loadAddon(new CanvasAddon())
        console.log('[terminal] Canvas renderer active (WebGL unavailable)')
      }
    }

    term.open(termRef.current)
    fitAddon.fit()
    loadRenderer()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Create PTY
    const cwd = (node.props.cwd as string) || ''
    const shell = (node.props.shell as string) || ''
    window.terminal.create(node.id, cwd, shell)

    // PTY → xterm
    const unsub = window.terminal.onData(node.id, (data) => term.write(data))
    unsubRef.current = unsub

    // xterm → PTY
    term.onData((data) => window.terminal.write(node.id, data))

    return () => {
      unsub()
      term.dispose()
      window.terminal.kill(node.id)
      xtermRef.current = null
      fitAddonRef.current = null
    }
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

  const TITLE_H = 32

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <BaseNode node={node}>
          <div
            style={{ width: '100%', height: node.height - 32, padding: '6px 8px', boxSizing: 'border-box' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div ref={termRef} style={{ width: '100%', height: '100%' }} />
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
