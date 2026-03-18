import React, { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { useMonaco, OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'

interface Props {
  node: NodeData
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TREE_W = 240
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
  html: 'html', css: 'css', scss: 'css', less: 'css',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'ini', xml: 'xml',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', java: 'java', kt: 'kotlin', swift: 'swift',
  tf: 'hcl', lua: 'lua', cs: 'csharp', php: 'php',
}

// Icon badge: [bg color, text, text color]
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
  yaml: ['#cc3e44', 'YML', '#fff'],
  yml:  ['#cc3e44', 'YML', '#fff'],
  toml: ['#9c4221', 'TOM', '#fff'],
  sql:  ['#e38c00', 'SQL', '#fff'],
  tf:   ['#5c4ee5', 'TF', '#fff'],
  lua:  ['#000080', 'LUA', '#fff'],
}

// ---------------------------------------------------------------------------
// Theme — VS Code Dark+ with purple accents
// ---------------------------------------------------------------------------

const THEME_NAME = 'canvaflow-cursor'

const THEME_DEF: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment',           foreground: '6a9955', fontStyle: 'italic' },
    { token: 'keyword',           foreground: '569cd6' },
    { token: 'keyword.control',   foreground: 'c586c0' },
    { token: 'string',            foreground: 'ce9178' },
    { token: 'number',            foreground: 'b5cea8' },
    { token: 'type',              foreground: '4ec9b0' },
    { token: 'class',             foreground: '4ec9b0' },
    { token: 'function',          foreground: 'dcdcaa' },
    { token: 'variable',          foreground: '9cdcfe' },
    { token: 'variable.readonly', foreground: '4fc1ff' },
    { token: 'operator',          foreground: 'd4d4d4' },
    { token: 'delimiter',         foreground: 'd4d4d4' },
    { token: 'tag',               foreground: '4ec9b0' },
    { token: 'attribute.name',    foreground: '9cdcfe' },
    { token: 'attribute.value',   foreground: 'ce9178' },
    { token: 'regexp',            foreground: 'd16969' },
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
    'editorSuggestWidget.highlightForeground': '#0097fb',
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
    'breadcrumb.focusForeground':         '#e8e8e8',
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
  overviewRulerLanes: 3,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  quickSuggestions: { other: true, comments: false, strings: false },
  wordWrap: 'off',
  tabSize: 2,
  automaticLayout: true,
  renderWhitespace: 'selection',
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
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
  if (!icon) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 2, height: size, borderRadius: 2,
        background: '#505050', color: '#ccc',
        fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
        flexShrink: 0, letterSpacing: '-0.5px',
      }}>
        {'·'}
      </span>
    )
  }
  const [bg, label, fg] = icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: size, minWidth: size + 4, paddingLeft: 2, paddingRight: 2,
      borderRadius: 2, background: bg, color: fg,
      fontSize: Math.max(7, size - 5), fontFamily: 'monospace', fontWeight: 700,
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

interface TreeEntry {
  path: string
  name: string
  isDir: boolean
  depth: number
  expanded: boolean
  loading: boolean
}

interface FileTreeProps {
  rootPath: string
  rootName: string
  selectedPath: string | null
  onSelect: (path: string, lang: string) => void
}

function FileTree({ rootPath, rootName, selectedPath, onSelect }: FileTreeProps): React.ReactElement {
  const [entries, setEntries] = useState<TreeEntry[]>([])
  const [rootExpanded, setRootExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Block wheel events from bubbling to the canvas native listener
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    if (!rootPath) return
    window.fs.readDir(rootPath).then((items) => {
      setEntries(
        sortEntries(items
          .filter(i => !IGNORED.has(i.name))
          .map(i => ({
            path: `${rootPath}/${i.name}`,
            name: i.name,
            isDir: i.isDir,
            depth: 0,
            expanded: false,
            loading: false,
          }))
        )
      )
    }).catch(() => {})
  }, [rootPath])

  const toggle = useCallback(async (entry: TreeEntry) => {
    if (!entry.isDir) {
      onSelect(entry.path, fileLang(entry.name))
      return
    }

    if (entry.expanded) {
      setEntries(prev => {
        const idx = prev.findIndex(e => e.path === entry.path)
        if (idx < 0) return prev
        let end = idx + 1
        while (end < prev.length && prev[end].depth > entry.depth) end++
        return [
          ...prev.slice(0, idx),
          { ...prev[idx], expanded: false, loading: false },
          ...prev.slice(end),
        ]
      })
    } else {
      setEntries(prev => prev.map(e => e.path === entry.path ? { ...e, loading: true } : e))
      try {
        const items = await window.fs.readDir(entry.path)
        const children = sortEntries(
          items
            .filter(i => !IGNORED.has(i.name))
            .map(i => ({
              path: `${entry.path}/${i.name}`,
              name: i.name,
              isDir: i.isDir,
              depth: entry.depth + 1,
              expanded: false,
              loading: false,
            }))
        )
        setEntries(prev => {
          const idx = prev.findIndex(e => e.path === entry.path)
          if (idx < 0) return prev
          return [
            ...prev.slice(0, idx),
            { ...prev[idx], expanded: true, loading: false },
            ...children,
            ...prev.slice(idx + 1),
          ]
        })
      } catch {
        setEntries(prev => prev.map(e => e.path === entry.path ? { ...e, loading: false } : e))
      }
    }
  }, [onSelect])

  const stopEvents = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tree header */}
      <div style={{
        height: 28, display: 'flex', alignItems: 'center',
        paddingLeft: 12, paddingRight: 8,
        background: '#252526', borderBottom: '1px solid #1e1e1e',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontFamily: 'system-ui, sans-serif',
          color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          Explorer
        </span>
      </div>

      {/* Scrollable tree body */}
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: '#252526' }}
        onPointerDown={stopEvents}
      >
        {/* Root folder row */}
        <div
          onClick={() => setRootExpanded(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 22, paddingLeft: 6, paddingRight: 8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 10, color: '#c5c5c5', width: 12, textAlign: 'center', flexShrink: 0 }}>
            {rootExpanded ? '▾' : '▸'}
          </span>
          <span style={{
            fontSize: 12, fontFamily: 'system-ui, sans-serif',
            color: '#e8e8e8', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {rootName}
          </span>
        </div>

        {rootExpanded && entries.map(entry => (
          <TreeRow
            key={entry.path}
            entry={entry}
            selected={selectedPath === entry.path}
            onClick={() => toggle(entry)}
          />
        ))}
      </div>
    </div>
  )
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

interface TreeRowProps {
  entry: TreeEntry
  selected: boolean
  onClick: () => void
}

function TreeRow({ entry, selected, onClick }: TreeRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  // 12px base indent + 16px per level + 12px for root chevron
  const paddingLeft = 24 + entry.depth * 16

  const bg = selected ? '#094771' : hovered ? '#2a2d2e' : 'transparent'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        paddingLeft, paddingRight: 10,
        height: 22, cursor: 'pointer',
        background: bg,
        userSelect: 'none',
      }}
    >
      {entry.isDir ? (
        <>
          <span style={{ fontSize: 9, color: '#c5c5c5', width: 12, textAlign: 'center', flexShrink: 0 }}>
            {entry.loading ? '…' : entry.expanded ? '▾' : '▸'}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>
            {entry.expanded ? '📂' : '📁'}
          </span>
          <span style={{
            fontSize: 13, fontFamily: 'system-ui, sans-serif',
            color: selected ? '#fff' : '#cccccc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.name}
          </span>
        </>
      ) : (
        <>
          <span style={{ width: 12, flexShrink: 0 }} />
          <FileIcon name={entry.name} size={14} />
          <span style={{
            fontSize: 13, fontFamily: 'system-ui, sans-serif',
            color: selected ? '#fff' : '#cccccc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.name}
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface OpenTab {
  path: string
  name: string
  lang: string
  dirty: boolean
}

interface TabBarProps {
  tabs: OpenTab[]
  activeTab: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

function TabBar({ tabs, activeTab, onSelect, onClose }: TabBarProps): React.ReactElement {
  const stopEvents = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div
      style={{
        height: TABS_H, display: 'flex', alignItems: 'stretch',
        background: '#252526', overflowX: 'auto', overflowY: 'hidden',
        flexShrink: 0, borderBottom: '1px solid #1e1e1e',
      }}
      onPointerDown={stopEvents}
      onWheel={stopEvents}
    >
      {tabs.map(tab => {
        const active = tab.path === activeTab
        return (
          <div
            key={tab.path}
            onClick={() => onSelect(tab.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              paddingLeft: 12, paddingRight: 6,
              minWidth: 100, maxWidth: 180,
              background: active ? '#1e1e1e' : 'transparent',
              borderRight: '1px solid #1e1e1e',
              borderTop: active ? '1px solid #a87fff' : '1px solid transparent',
              cursor: 'pointer', flexShrink: 0,
              position: 'relative',
            }}
          >
            <FileIcon name={tab.name} size={13} />
            <span style={{
              fontSize: 12, fontFamily: 'system-ui, sans-serif',
              color: active ? '#ffffff' : '#8a8a8a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {tab.name}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onClose(tab.path) }}
              style={{
                fontSize: 14, color: tab.dirty ? '#a87fff' : '#666',
                lineHeight: 1, cursor: 'pointer', flexShrink: 0,
                width: 16, textAlign: 'center',
                borderRadius: 3,
              }}
              title={tab.dirty ? 'Unsaved changes' : 'Close'}
            >
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
  const relative = path.startsWith(rootPath)
    ? path.slice(rootPath.length).replace(/^\//, '')
    : path
  const parts = relative.split('/')

  return (
    <div style={{
      height: BREADCRUMB_H, display: 'flex', alignItems: 'center',
      paddingLeft: 12, paddingRight: 12, gap: 0,
      background: '#1e1e1e', borderBottom: '1px solid #2d2d2d',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          <span style={{
            fontSize: 11, fontFamily: 'system-ui, sans-serif',
            color: i === parts.length - 1 ? '#cccccc' : '#888',
            whiteSpace: 'nowrap',
          }}>
            {part}
          </span>
          {i < parts.length - 1 && (
            <span style={{ fontSize: 11, color: '#555', padding: '0 3px' }}>›</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MonacoNode({ node }: Props): React.ReactElement {
  const monaco = useMonaco()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const { update } = useNodeStore()

  const rootPath = (node.props.rootPath as string) || getActiveWorkspace()?.path || ''
  const rootName = rootPath.split('/').pop() || rootPath

  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(
    (node.props.openFilePath as string) || null
  )
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })

  const activeTab = tabs.find(t => t.path === activeTabPath) ?? null

  // Register Monaco theme
  useEffect(() => {
    if (!monaco) return
    monaco.editor.defineTheme(THEME_NAME, THEME_DEF)
    monaco.editor.setTheme(THEME_NAME)
  }, [monaco])

  // Load persisted open file on first mount
  useEffect(() => {
    const path = node.props.openFilePath as string | undefined
    if (!path) return
    window.fs.readFile(path).then(content => {
      const name = path.split('/').pop()!
      setFileContents(prev => ({ ...prev, [path]: content }))
      setTabs([{ path, name, lang: fileLang(name), dirty: false }])
      setActiveTabPath(path)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = useCallback(async (path: string, lang: string) => {
    const name = path.split('/').pop()!

    // If already open, just focus it
    setTabs(prev => {
      if (prev.some(t => t.path === path)) return prev
      return [...prev, { path, name, lang, dirty: false }]
    })
    setActiveTabPath(path)

    if (!fileContents[path]) {
      try {
        const content = await window.fs.readFile(path)
        setFileContents(prev => ({ ...prev, [path]: content }))
      } catch (err) {
        console.error('Failed to read file:', err)
        return
      }
    }

    update(node.id, {
      title: name,
      props: { ...node.props, openFilePath: path, rootPath },
    })
  }, [fileContents, node.id, node.props, rootPath, update])

  const closeTab = useCallback((path: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path)
      if (activeTabPath === path) {
        const idx = prev.findIndex(t => t.path === path)
        const fallback = next[Math.min(idx, next.length - 1)]?.path ?? null
        setActiveTabPath(fallback)
      }
      return next
    })
  }, [activeTabPath])

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor
    monacoInstance.editor.defineTheme(THEME_NAME, THEME_DEF)
    monacoInstance.editor.setTheme(THEME_NAME)

    editor.onDidChangeCursorPosition(ev => {
      setCursorPos({ line: ev.position.lineNumber, col: ev.position.column })
    })

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      const path = activeTabPathRef.current
      const content = editor.getValue()
      if (!path) return
      window.fs.writeFile(path, content)
        .then(() => {
          setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: false } : t))
        })
        .catch(console.error)
    })
  }, [])

  const activeTabPathRef = useRef(activeTabPath)
  useEffect(() => { activeTabPathRef.current = activeTabPath }, [activeTabPath])

  const handleChange = useCallback((value: string | undefined) => {
    const path = activeTabPathRef.current
    if (!path || value === undefined) return

    setFileContents(prev => ({ ...prev, [path]: value }))
    setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: true } : t))

    if (saveTimers.current[path]) clearTimeout(saveTimers.current[path])
    saveTimers.current[path] = setTimeout(() => {
      window.fs.writeFile(path, value)
        .then(() => setTabs(prev => prev.map(t => t.path === path ? { ...t, dirty: false } : t)))
        .catch(console.error)
    }, 1500)
  }, [])

  const stopEvents = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <BaseNode node={node}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#1e1e1e' }}>

        {/* Sidebar */}
        <div style={{
          width: TREE_W, flexShrink: 0,
          borderRight: '1px solid #1e1e1e',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <FileTree
            rootPath={rootPath}
            rootName={rootName}
            selectedPath={activeTabPath}
            onSelect={openFile}
          />
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Tabs */}
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTab={activeTabPath}
              onSelect={setActiveTabPath}
              onClose={closeTab}
            />
          )}

          {/* Breadcrumb */}
          {activeTab && (
            <Breadcrumb path={activeTab.path} rootPath={rootPath} />
          )}

          {/* Monaco */}
          <div
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            onPointerDown={stopEvents}
            onWheel={stopEvents}
          >
            {activeTab ? (
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
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                background: '#1e1e1e',
              }}>
                <span style={{ fontSize: 40, opacity: 0.06 }}>{'</>'}</span>
                <span style={{ fontSize: 13, fontFamily: 'system-ui, sans-serif', color: '#444' }}>
                  Open a file from the explorer
                </span>
                <span style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', color: '#333' }}>
                  ⌘S to save
                </span>
              </div>
            )}
          </div>

          {/* Status bar */}
          {activeTab && (
            <div
              style={{
                height: 22, display: 'flex', alignItems: 'center',
                paddingLeft: 12, paddingRight: 12, gap: 12,
                background: '#007acc', flexShrink: 0,
              }}
              onPointerDown={stopEvents}
            >
              <span style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', color: '#fff', opacity: 0.9 }}>
                {activeTab.lang}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', color: '#fff', opacity: 0.9 }}>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', color: '#fff', opacity: 0.9 }}>
                UTF-8
              </span>
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
