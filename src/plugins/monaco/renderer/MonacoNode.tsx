import React, { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, useMonaco, OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import { initTextMate } from './textmateSetup'
import { GitPanel } from './GitPanel'
import { SearchOverlay } from './SearchOverlay'

interface Props {
  node: NodeData
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAIL_W = 36
const PANEL_W = 208
const SIDEBAR_W = RAIL_W + PANEL_W
const TABS_H = 35
const BREADCRUMB_H = 22
const IGNORED = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'out', 'target',
  '__pycache__', '.DS_Store', 'coverage', '.turbo', '.cache',
])

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', markdown: 'markdown',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', java: 'java', kt: 'kotlin', swift: 'swift',
  tf: 'hcl', lua: 'lua', cs: 'csharp', php: 'php',
}

const EXT_ICON: Record<string, [string, string, string]> = {
  ts:   ['#3178c6', 'TS', '#fff'],
  tsx:  ['#3178c6', 'TSX', '#fff'],
  js:   ['#f7df1e', 'JS', '#000'],
  jsx:  ['#f7df1e', 'JSX', '#000'],
  py:   ['#3572a5', 'PY', '#fff'],
  rs:   ['#ce412b', 'RS', '#fff'],
  go:   ['#00acd7', 'GO', '#fff'],
  json: ['#cbcb41', '{ }', '#000'],
  md:   ['#519aba', 'MD', '#fff'],
  css:  ['#563d7c', 'CSS', '#fff'],
  scss: ['#c6538c', 'SC', '#fff'],
  html: ['#e34c26', 'HTM', '#fff'],
  sh:   ['#4eaa25', 'SH', '#fff'],
  bash: ['#4eaa25', 'SH', '#fff'],
  zsh:  ['#4eaa25', 'SH', '#fff'],
  yaml: ['#cc3e44', 'YML', '#fff'],
  yml:  ['#cc3e44', 'YML', '#fff'],
  toml: ['#9c4221', 'TOM', '#fff'],
  sql:  ['#e38c00', 'SQL', '#fff'],
  tf:   ['#5c4ee5', 'TF', '#fff'],
  lua:  ['#000080', 'LUA', '#fff'],
}

// ---------------------------------------------------------------------------
// Theme — VS Code Dark+ UI colors; syntax comes from shiki/dark-plus
// ---------------------------------------------------------------------------

const THEME_NAME = 'canvaflow-dark'

const THEME_DEF: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Comments
    { token: 'comment',                   foreground: '6a9955', fontStyle: 'italic' },
    { token: 'comment.doc',               foreground: '6a9955', fontStyle: 'italic' },
    // Keywords
    { token: 'keyword',                   foreground: '569cd6' },
    { token: 'keyword.control',           foreground: 'c586c0' },
    { token: 'keyword.operator',          foreground: '569cd6' },
    { token: 'keyword.other',             foreground: '569cd6' },
    // Storage / modifiers
    { token: 'storage',                   foreground: '569cd6' },
    { token: 'storage.type',              foreground: '569cd6' },
    { token: 'storage.modifier',          foreground: '569cd6' },
    // Strings
    { token: 'string',                    foreground: 'ce9178' },
    { token: 'string.escape',             foreground: 'd7ba7d' },
    { token: 'string.template',           foreground: 'ce9178' },
    // Numbers & constants
    { token: 'number',                    foreground: 'b5cea8' },
    { token: 'number.float',              foreground: 'b5cea8' },
    { token: 'constant.numeric',          foreground: 'b5cea8' },
    { token: 'constant.language',         foreground: '569cd6' },
    { token: 'constant.character.escape', foreground: 'd7ba7d' },
    // Types & classes
    { token: 'type',                      foreground: '4ec9b0' },
    { token: 'type.identifier',           foreground: '4ec9b0' },
    { token: 'class',                     foreground: '4ec9b0' },
    { token: 'entity.name.type',          foreground: '4ec9b0' },
    { token: 'entity.name.class',         foreground: '4ec9b0' },
    { token: 'support.type',              foreground: '4ec9b0' },
    { token: 'support.class',             foreground: '4ec9b0' },
    // Functions
    { token: 'function',                  foreground: 'dcdcaa' },
    { token: 'entity.name.function',      foreground: 'dcdcaa' },
    { token: 'support.function',          foreground: 'dcdcaa' },
    // Variables & parameters
    { token: 'variable',                  foreground: '9cdcfe' },
    { token: 'variable.other',            foreground: '9cdcfe' },
    { token: 'variable.parameter',        foreground: '9cdcfe' },
    { token: 'variable.readonly',         foreground: '4fc1ff' },
    { token: 'parameter',                 foreground: '9cdcfe' },
    { token: 'identifier',                foreground: '9cdcfe' },
    // Properties
    { token: 'property',                  foreground: '9cdcfe' },
    { token: 'member',                    foreground: '9cdcfe' },
    // Operators & punctuation
    { token: 'operator',                  foreground: 'd4d4d4' },
    { token: 'delimiter',                 foreground: 'd4d4d4' },
    { token: 'delimiter.bracket',         foreground: 'd4d4d4' },
    { token: 'punctuation',               foreground: 'd4d4d4' },
    // HTML / XML
    { token: 'tag',                       foreground: '569cd6' },
    { token: 'tag.id',                    foreground: '569cd6' },
    { token: 'tag.class',                 foreground: '569cd6' },
    { token: 'metatag',                   foreground: '569cd6' },
    { token: 'attribute.name',            foreground: '9cdcfe' },
    { token: 'attribute.value',           foreground: 'ce9178' },
    // CSS
    { token: 'selector',                  foreground: 'd7ba7d' },
    { token: 'selector.tag',              foreground: '569cd6' },
    { token: 'selector.class',            foreground: 'd7ba7d' },
    { token: 'selector.id',               foreground: 'd7ba7d' },
    { token: 'attribute.scss',            foreground: '9cdcfe' },
    { token: 'value.unit',                foreground: 'b5cea8' },
    { token: 'value.hex',                 foreground: 'b5cea8' },
    // Markdown
    { token: 'markup.heading',            foreground: '569cd6', fontStyle: 'bold' },
    { token: 'markup.bold',               foreground: 'd4d4d4', fontStyle: 'bold' },
    { token: 'markup.italic',             foreground: 'd4d4d4', fontStyle: 'italic' },
    { token: 'markup.underline.link',     foreground: '4ec9b0' },
    { token: 'string.link',               foreground: '4ec9b0' },
    // Regex
    { token: 'regexp',                    foreground: 'd16969' },
    { token: 'regexp.escape',             foreground: 'd7ba7d' },
    // Decorators / annotations
    { token: 'annotation',                foreground: 'dcdcaa' },
    { token: 'decorator',                 foreground: 'dcdcaa' },
    // Python specifics
    { token: 'keyword.python',            foreground: 'c586c0' },
    { token: 'builtins.python',           foreground: '4ec9b0' },
    // Rust specifics
    { token: 'lifetime',                  foreground: 'c586c0' },
    { token: 'attribute.rust',            foreground: 'dcdcaa' },
  ],
  colors: {
    'editor.background':                  '#1e1e1e',
    'editor.foreground':                  '#d4d4d4',
    'editorCursor.foreground':            '#a87fff',
    'editor.selectionBackground':         '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editor.lineHighlightBackground':     '#2a2d2e',
    'editorLineNumber.foreground':        '#858585',
    'editorLineNumber.activeForeground':  '#c6c6c6',
    'editorIndentGuide.background1':      '#404040',
    'editorIndentGuide.activeBackground1':'#707070',
    'editorWidget.background':            '#252526',
    'editorWidget.border':                '#454545',
    'editorSuggestWidget.background':     '#252526',
    'editorSuggestWidget.border':         '#454545',
    'editorSuggestWidget.selectedBackground': '#062f4a',
    'input.background':                   '#3c3c3c',
    'input.border':                       '#3c3c3c',
    'scrollbarSlider.background':         '#79797966',
    'scrollbarSlider.hoverBackground':    '#646464b3',
    'scrollbarSlider.activeBackground':   '#bfbfbf66',
    'minimap.background':                 '#1e1e1e',
    'editorGutter.background':            '#1e1e1e',
    'editor.findMatchBackground':         '#9e6a03cc',
    'editor.findMatchHighlightBackground':'#9e6a0366',
    'editorBracketHighlight.foreground1': '#ffd700',
    'editorBracketHighlight.foreground2': '#da70d6',
    'editorBracketHighlight.foreground3': '#87ceeb',
    'breadcrumb.background':              '#1e1e1e',
    'breadcrumb.foreground':              '#cccccc99',
    'diffEditor.insertedTextBackground':  '#9bb95533',
    'diffEditor.removedTextBackground':   '#ff000033',
    'diffEditor.insertedLineBackground':  '#9bb95520',
    'diffEditor.removedLineBackground':   '#ff000020',
  },
}

const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
  fontLigatures: true,
  fontSize: 13,
  lineHeight: 1.6,
  minimap: { enabled: true, scale: 1, renderCharacters: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'line',
  padding: { top: 8, bottom: 12 },
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  wordWrap: 'off',
  tabSize: 2,
  automaticLayout: true,
  renderWhitespace: 'selection',
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function fileLang(name: string): string {
  return EXT_LANG[getExt(name)] ?? 'plaintext'
}

function FileIcon({ name, size = 14 }: { name: string; size?: number }): React.ReactElement {
  const ext = getExt(name)
  const icon = EXT_ICON[ext]
  if (!icon) return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 2, height: size, borderRadius: 2,
      background: '#505050', color: '#ccc',
      fontSize: 7, fontFamily: 'monospace', fontWeight: 700, flexShrink: 0,
    }}>·</span>
  )
  const [bg, label, fg] = icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: size, minWidth: size + 4, paddingLeft: 2, paddingRight: 2,
      borderRadius: 2, background: bg, color: fg,
      fontSize: Math.max(7, size - 5), fontFamily: 'monospace', fontWeight: 700, flexShrink: 0,
    }}>{label}</span>
  )
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

interface TreeEntry { path: string; name: string; isDir: boolean; depth: number; expanded: boolean; loading: boolean }

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function FileTree({ rootPath, rootName, selectedPath, onSelect, gitFiles }: {
  rootPath: string; rootName: string; selectedPath: string | null
  onSelect: (path: string, lang: string) => void
  gitFiles?: Map<string, string>
}): React.ReactElement {
  const [entries, setEntries] = useState<TreeEntry[]>([])
  const [rootExpanded, setRootExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<TreeEntry[]>([])
  const prevSelectedPath = useRef<string | null>(null)

  // Keep ref in sync so async reveal can read current state without stale closures
  useEffect(() => { entriesRef.current = entries }, [entries])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  // Expand every parent directory along the path to targetPath
  const revealFile = useCallback(async (targetPath: string) => {
    if (!targetPath.startsWith(rootPath + '/')) return
    const segments = targetPath.slice(rootPath.length + 1).split('/')
    segments.pop() // drop filename, keep only directory parts
    if (segments.length === 0) return // file is at root level, already visible

    let dirPath = rootPath
    for (const segment of segments) {
      dirPath = `${dirPath}/${segment}`
      const entry = entriesRef.current.find(e => e.path === dirPath)
      if (!entry) break       // dir not in tree yet — shouldn't happen
      if (entry.expanded) continue // already open, move on

      try {
        const items = await window.fs.readDir(dirPath)
        const children = sortEntries(
          items.filter(i => !IGNORED.has(i.name)).map(i => ({
            path: `${dirPath}/${i.name}`, name: i.name, isDir: i.isDir,
            depth: entry.depth + 1, expanded: false, loading: false,
          }))
        )
        setEntries(prev => {
          const idx = prev.findIndex(e => e.path === dirPath)
          if (idx < 0 || prev[idx].expanded) return prev
          return [...prev.slice(0, idx), { ...prev[idx], expanded: true }, ...children, ...prev.slice(idx + 1)]
        })
        // Wait one frame for React to re-render + update entriesRef before the next iteration
        await new Promise<void>(r => requestAnimationFrame(() => r()))
      } catch { break }
    }

    // Scroll selected item into view
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    })
  }, [rootPath])

  useEffect(() => {
    if (!rootPath) return
    window.fs.readDir(rootPath).then(items => {
      const sorted = sortEntries(items.filter(i => !IGNORED.has(i.name)).map(i => ({
        path: `${rootPath}/${i.name}`, name: i.name, isDir: i.isDir, depth: 0, expanded: false, loading: false,
      })))
      entriesRef.current = sorted // seed ref before state so revealFile can read it immediately
      setEntries(sorted)
      if (selectedPath) revealFile(selectedPath)
    }).catch(() => {})
  }, [rootPath]) // eslint-disable-line

  // Reveal whenever the user opens a different file
  useEffect(() => {
    if (!selectedPath || selectedPath === prevSelectedPath.current) return
    prevSelectedPath.current = selectedPath
    if (entriesRef.current.length > 0) revealFile(selectedPath)
  }, [selectedPath, revealFile])

  const toggle = useCallback(async (entry: TreeEntry) => {
    if (!entry.isDir) { onSelect(entry.path, fileLang(entry.name)); return }
    if (entry.expanded) {
      setEntries(prev => {
        const idx = prev.findIndex(e => e.path === entry.path)
        if (idx < 0) return prev
        let end = idx + 1
        while (end < prev.length && prev[end].depth > entry.depth) end++
        return [...prev.slice(0, idx), { ...prev[idx], expanded: false }, ...prev.slice(end)]
      })
    } else {
      setEntries(prev => prev.map(e => e.path === entry.path ? { ...e, loading: true } : e))
      try {
        const items = await window.fs.readDir(entry.path)
        const children = sortEntries(items.filter(i => !IGNORED.has(i.name)).map(i => ({
          path: `${entry.path}/${i.name}`, name: i.name, isDir: i.isDir,
          depth: entry.depth + 1, expanded: false, loading: false,
        })))
        setEntries(prev => {
          const idx = prev.findIndex(e => e.path === entry.path)
          if (idx < 0) return prev
          return [...prev.slice(0, idx), { ...prev[idx], expanded: true, loading: false }, ...children, ...prev.slice(idx + 1)]
        })
      } catch {
        setEntries(prev => prev.map(e => e.path === entry.path ? { ...e, loading: false } : e))
      }
    }
  }, [onSelect])

  // git color for a file path
  const gitColor = (path: string): string | undefined => {
    if (!gitFiles) return undefined
    const rel = path.startsWith(rootPath) ? path.slice(rootPath.length + 1) : path
    const s = gitFiles.get(rel)
    if (!s) return undefined
    if (s === 'A' || s === '?') return '#73c991'
    if (s === 'M') return '#e2c08d'
    if (s === 'D') return '#f44747'
    return undefined
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        height: 28, display: 'flex', alignItems: 'center',
        paddingLeft: 12, paddingRight: 8,
        background: '#252526', borderBottom: '1px solid #1e1e1e', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontFamily: 'system-ui', color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Explorer
        </span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: '#252526' }} onPointerDown={e => e.stopPropagation()}>
        <div onClick={() => setRootExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 22, paddingLeft: 6, cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontSize: 10, color: '#c5c5c5', width: 12, textAlign: 'center', flexShrink: 0 }}>{rootExpanded ? '▾' : '▸'}</span>
          <span style={{ fontSize: 12, fontFamily: 'system-ui', color: '#e8e8e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rootName}</span>
        </div>
        {rootExpanded && entries.map(entry => {
          const color = gitColor(entry.path)
          const paddingLeft = 24 + entry.depth * 16
          const selected = selectedPath === entry.path
          return (
            <TreeRow key={entry.path} entry={entry} selected={selected} gitColor={color} paddingLeft={paddingLeft} onClick={() => toggle(entry)} />
          )
        })}
      </div>
    </div>
  )
}

function TreeRow({ entry, selected, gitColor, paddingLeft, onClick }: {
  entry: TreeEntry; selected: boolean; gitColor?: string; paddingLeft: number; onClick: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-selected={selected ? 'true' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft, paddingRight: 10, height: 22, cursor: 'pointer', background: selected ? '#094771' : hovered ? '#2a2d2e' : 'transparent', userSelect: 'none' }}
    >
      {entry.isDir ? (
        <>
          <span style={{ fontSize: 9, color: '#c5c5c5', width: 12, textAlign: 'center', flexShrink: 0 }}>{entry.loading ? '…' : entry.expanded ? '▾' : '▸'}</span>
          <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{entry.expanded ? '📂' : '📁'}</span>
          <span style={{ fontSize: 13, fontFamily: 'system-ui', color: gitColor ?? (selected ? '#fff' : '#cccccc'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </>
      ) : (
        <>
          <span style={{ width: 12, flexShrink: 0 }} />
          <FileIcon name={entry.name} size={14} />
          <span style={{ fontSize: 13, fontFamily: 'system-ui', color: gitColor ?? (selected ? '#fff' : '#cccccc'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface OpenTab { path: string; name: string; lang: string; dirty: boolean }

function TabBar({ tabs, activeTab, onSelect, onClose }: {
  tabs: OpenTab[]; activeTab: string | null
  onSelect: (path: string) => void; onClose: (path: string) => void
}): React.ReactElement {
  return (
    <div
      style={{ height: TABS_H, display: 'flex', alignItems: 'stretch', background: '#252526', overflowX: 'auto', overflowY: 'hidden', flexShrink: 0, borderBottom: '1px solid #1e1e1e' }}
      onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
    >
      {tabs.map(tab => {
        const active = tab.path === activeTab
        return (
          <div key={tab.path} onClick={() => onSelect(tab.path)} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6, minWidth: 100, maxWidth: 180, background: active ? '#1e1e1e' : 'transparent', borderRight: '1px solid #1e1e1e', borderTop: active ? '1px solid #a87fff' : '1px solid transparent', cursor: 'pointer', flexShrink: 0 }}>
            <FileIcon name={tab.name} size={13} />
            <span style={{ fontSize: 12, fontFamily: 'system-ui', color: active ? '#fff' : '#8a8a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tab.name}</span>
            <span onClick={e => { e.stopPropagation(); onClose(tab.path) }} style={{ fontSize: 14, color: tab.dirty ? '#a87fff' : '#666', lineHeight: 1, cursor: 'pointer', flexShrink: 0, width: 16, textAlign: 'center', borderRadius: 3 }} title={tab.dirty ? 'Unsaved changes' : 'Close'}>
              {tab.dirty ? '●' : '×'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

function Breadcrumb({ path, rootPath }: { path: string; rootPath: string }): React.ReactElement {
  const relative = path.startsWith(rootPath) ? path.slice(rootPath.length).replace(/^\//, '') : path
  const parts = relative.split('/')
  return (
    <div style={{ height: BREADCRUMB_H, display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 12, background: '#1e1e1e', borderBottom: '1px solid #2d2d2d', flexShrink: 0, overflow: 'hidden' }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          <span style={{ fontSize: 11, fontFamily: 'system-ui', color: i === parts.length - 1 ? '#cccccc' : '#888', whiteSpace: 'nowrap' }}>{part}</span>
          {i < parts.length - 1 && <span style={{ fontSize: 11, color: '#555', padding: '0 3px' }}>›</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar icon rail
// ---------------------------------------------------------------------------

function RailBtn({ icon, title, active, badge, onClick }: {
  icon: string; title: string; active: boolean; badge?: boolean; onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: RAIL_W, height: RAIL_W, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? '#37373d' : 'transparent',
        border: 'none', borderLeft: active ? '2px solid #a87fff' : '2px solid transparent',
        cursor: 'pointer', position: 'relative', flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      {badge && <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#73c991' }} />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type SidebarTab = 'files' | 'git'
type DiffState = { path: string; original: string | null; modified: string; lang: string } | null

export function MonacoNode({ node }: Props): React.ReactElement {
  const monaco = useMonaco()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const activeTabPathRef = useRef<string | null>(null)
  const gitRefreshRef = useRef<(() => void) | null>(null)
  const { update } = useNodeStore()

  const rootPath = (node.props.rootPath as string) || getActiveWorkspace()?.path || ''
  const rootName = rootPath.split('/').pop() || rootPath

  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>((node.props.openFilePath as string) || null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files')
  const [diffState, setDiffState] = useState<DiffState>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [gitStatus, setGitStatus] = useState<{ files: Array<{ path: string; index: string; working: string }> } | null>(null)

  const activeTab = tabs.find(t => t.path === activeTabPath) ?? null

  // git badge: show dot if there are changes
  const gitBadge = (gitStatus?.files.length ?? 0) > 0

  // git file status map for file tree decorations
  const gitFiles = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const f of gitStatus?.files ?? []) {
      const s = f.index !== ' ' && f.index !== '?' ? f.index : f.working
      m.set(f.path, s)
    }
    return m
  }, [gitStatus])

  // Register Monaco theme + suppress false diagnostics (no tsconfig awareness)
  useEffect(() => {
    if (!monaco) return
    monaco.editor.defineTheme(THEME_NAME, THEME_DEF)
    monaco.editor.setTheme(THEME_NAME)

    // We're a viewer — turn off semantic errors (missing modules, type errors from
    // unknown path aliases, etc.). Syntax errors are still shown.
    const noSemantic = { noSemanticValidation: true, noSyntaxValidation: false }
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(noSemantic)
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(noSemantic)

    // Permissive compiler options so the worker doesn't choke on JSX or ESM
    const compilerOpts = {
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowSyntheticDefaultImports: true,
      allowJs: true,
      noEmit: true,
    }
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOpts)
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOpts)
  }, [monaco])

  // Load persisted file on first mount
  useEffect(() => {
    const path = node.props.openFilePath as string | undefined
    if (!path) return
    window.fs.readFile(path).then(content => {
      const name = path.split('/').pop()!
      setFileContents(prev => ({ ...prev, [path]: content }))
      setTabs([{ path, name, lang: fileLang(name), dirty: false }])
      setActiveTabPath(path)
    }).catch(() => {})
  }, []) // eslint-disable-line

  // Load git status on mount and when rootPath changes
  useEffect(() => {
    if (!rootPath) return
    window.git.isRepo(rootPath).then(isRepo => {
      if (isRepo) window.git.status(rootPath).then(setGitStatus).catch(() => {})
    }).catch(() => {})
  }, [rootPath])

  useEffect(() => { activeTabPathRef.current = activeTabPath }, [activeTabPath])

  const openFile = useCallback(async (path: string, lang: string) => {
    setDiffState(null)
    const name = path.split('/').pop()!

    // Load content before activating the tab so the editor never mounts with empty defaultValue
    if (!fileContents[path]) {
      try {
        const content = await window.fs.readFile(path)
        setFileContents(prev => ({ ...prev, [path]: content }))
      } catch { return }
    }

    setTabs(prev => prev.some(t => t.path === path) ? prev : [...prev, { path, name, lang, dirty: false }])
    setActiveTabPath(path)
    update(node.id, { title: name, props: { ...node.props, openFilePath: path, rootPath } })
  }, [fileContents, node.id, node.props, rootPath, update])

  const openDiff = useCallback((filePath: string, original: string | null, modified: string, lang: string) => {
    setDiffState({ path: filePath, original, modified, lang })
  }, [])

  const closeTab = useCallback((path: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path)
      if (activeTabPath === path) {
        const idx = prev.findIndex(t => t.path === path)
        setActiveTabPath(next[Math.min(idx, next.length - 1)]?.path ?? null)
      }
      return next
    })
  }, [activeTabPath])

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor

    editor.onDidChangeCursorPosition(ev => {
      setCursorPos({ line: ev.position.lineNumber, col: ev.position.column })
    })

    // Cmd+S save
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      const path = activeTabPathRef.current
      const content = editor.getValue()
      if (!path) return
      window.fs.writeFile(path, content)
        .then(() => {
          setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: false } : t))
          gitRefreshRef.current?.()
        })
        .catch(console.error)
    })

    // Cmd+P → open search overlay
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyP, () => {
      setShowSearch(true)
    })
  }, [])

  const handleChange = useCallback((value: string | undefined) => {
    const path = activeTabPathRef.current
    if (!path || value === undefined) return
    setFileContents(prev => ({ ...prev, [path]: value }))
    setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: true } : t))
    if (saveTimers.current[path]) clearTimeout(saveTimers.current[path])
    saveTimers.current[path] = setTimeout(() => {
      window.fs.writeFile(path, value)
        .then(() => {
          setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: false } : t))
          gitRefreshRef.current?.()
        })
        .catch(console.error)
    }, 1500)
  }, [])

  // Cmd+P outside Monaco editor (when editor doesn't have focus)
  const onContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey && e.key === 'p') { e.preventDefault(); e.stopPropagation(); setShowSearch(true) }
  }, [])

  const closeDiff = useCallback(() => setDiffState(null), [])

  return (
    <BaseNode node={node}>
      <div
        style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#1e1e1e', position: 'relative' }}
        onKeyDown={onContainerKeyDown}
      >

        {/* Sidebar: icon rail + panel */}
        <div style={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex', borderRight: '1px solid #1e1e1e' }}>

          {/* Icon rail */}
          <div style={{ width: RAIL_W, display: 'flex', flexDirection: 'column', background: '#333333', borderRight: '1px solid #1e1e1e', flexShrink: 0 }}>
            <RailBtn icon="📁" title="Explorer" active={sidebarTab === 'files'} onClick={() => setSidebarTab('files')} />
            <RailBtn icon="⎇" title="Source Control" active={sidebarTab === 'git'} badge={gitBadge} onClick={() => setSidebarTab('git')} />
          </div>

          {/* Panel content */}
          <div style={{ width: PANEL_W, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {sidebarTab === 'files' && (
              <FileTree
                rootPath={rootPath}
                rootName={rootName}
                selectedPath={activeTabPath}
                onSelect={openFile}
                gitFiles={gitFiles}
              />
            )}
            {sidebarTab === 'git' && (
              <GitPanel
                rootPath={rootPath}
                onOpenDiff={openDiff}
                onRefreshNeeded={fn => { gitRefreshRef.current = fn }}
              />
            )}
          </div>
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Tabs */}
          {tabs.length > 0 && !diffState && (
            <TabBar tabs={tabs} activeTab={activeTabPath} onSelect={p => { setActiveTabPath(p); setDiffState(null) }} onClose={closeTab} />
          )}

          {/* Diff header */}
          {diffState && (
            <div style={{ height: TABS_H, display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 8, background: '#252526', borderBottom: '1px solid #1e1e1e', flexShrink: 0, gap: 8 }}>
              <span style={{ fontSize: 12, color: '#d4d4d4', fontFamily: 'system-ui', flex: 1 }}>
                {diffState.path.split('/').pop()} <span style={{ color: '#666' }}>— diff view</span>
              </span>
              <button
                onClick={closeDiff}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, padding: '2px 6px', fontFamily: 'system-ui', borderRadius: 3 }}
              >
                ✕ Close Diff
              </button>
            </div>
          )}

          {/* Breadcrumb */}
          {activeTab && !diffState && <Breadcrumb path={activeTab.path} rootPath={rootPath} />}

          {/* Monaco editor / diff editor */}
          <div
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            onPointerDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            {diffState ? (
              <DiffEditor
                height="100%"
                language={diffState.lang}
                original={diffState.original ?? ''}
                modified={diffState.modified}
                theme={THEME_NAME}
                options={{ ...EDITOR_OPTIONS, readOnly: true }}
              />
            ) : activeTab ? (
              <Editor
                key={activeTab.path}
                height="100%"
                language={activeTab.lang}
                defaultValue={fileContents[activeTab.path] ?? ''}
                theme={THEME_NAME}
                options={EDITOR_OPTIONS}
                onMount={handleMount}
                onChange={handleChange}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#1e1e1e' }}>
                <span style={{ fontSize: 40, opacity: 0.06 }}>{'</>'}</span>
                <span style={{ fontSize: 13, fontFamily: 'system-ui', color: '#444' }}>Open a file from the explorer</span>
                <span style={{ fontSize: 11, fontFamily: 'system-ui', color: '#333' }}>⌘P to search files</span>
              </div>
            )}
          </div>

          {/* Status bar */}
          {(activeTab || diffState) && (
            <div
              style={{ height: 22, display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 12, gap: 12, background: '#007acc', flexShrink: 0 }}
              onPointerDown={e => e.stopPropagation()}
            >
              {gitStatus && (
                <span
                  onClick={() => setSidebarTab('git')}
                  style={{ fontSize: 11, fontFamily: 'system-ui', color: '#fff', opacity: 0.9, cursor: 'pointer' }}
                  title="Source Control"
                >
                  ⎇ {gitStatus.files.length > 0 ? gitStatus.files.length + ' changes' : 'clean'}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontFamily: 'system-ui', color: '#fff', opacity: 0.9 }}>
                {diffState ? diffState.lang : activeTab?.lang}
              </span>
              {!diffState && (
                <span style={{ fontSize: 11, fontFamily: 'system-ui', color: '#fff', opacity: 0.9 }}>
                  Ln {cursorPos.line}, Col {cursorPos.col}
                </span>
              )}
              <span style={{ fontSize: 11, fontFamily: 'system-ui', color: '#fff', opacity: 0.9 }}>UTF-8</span>
            </div>
          )}
        </div>

        {/* Search overlay */}
        {showSearch && (
          <SearchOverlay
            rootPath={rootPath}
            onSelect={openFile}
            onClose={() => setShowSearch(false)}
          />
        )}
      </div>
    </BaseNode>
  )
}
