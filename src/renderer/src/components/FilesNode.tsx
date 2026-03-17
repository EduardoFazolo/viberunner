import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NodeData, useNodeStore } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'

type FsEntry = { name: string; isDir: boolean; size: number; modified: number }
type ViewMode = 'list' | 'grid'

interface Props {
  node: NodeData
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fileColor(name: string, isDir: boolean): string {
  if (isDir) return '#7c9fcb'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return '#f0db4f'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '#8fbcbb'
  if (['md', 'txt', 'rst'].includes(ext)) return '#d8dee9'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return '#a3be8c'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return '#bf616a'
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '#b48ead'
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return '#d08770'
  if (['pdf'].includes(ext)) return '#bf616a'
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return '#88c0d0'
  return 'rgba(255,255,255,0.45)'
}

function FolderIconLarge({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="36" height="30" viewBox="0 0 36 30" fill="none">
      <path
        d="M2 5C2 3.34 3.34 2 5 2H12L15 6H31C32.66 6 34 7.34 34 9V25C34 26.66 32.66 28 31 28H5C3.34 28 2 26.66 2 25V5Z"
        fill={color} opacity="0.8"
      />
      <path
        d="M2 10H34" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
      />
    </svg>
  )
}

function FolderIconSmall({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M1 2.5C1 1.67 1.67 1 2.5 1H5.5L7 3H13.5C14.33 3 15 3.67 15 4.5V11.5C15 12.33 14.33 13 13.5 13H2.5C1.67 13 1 12.33 1 11.5V2.5Z"
        fill={color} opacity="0.85"
      />
    </svg>
  )
}

function FileIconSmall({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M2 1H8L12 5V14C12 14.55 11.55 15 11 15H2C1.45 15 1 14.55 1 14V2C1 1.45 1.45 1 2 1Z"
        fill={color} opacity="0.6" stroke={color} strokeWidth="0.5"
      />
      <path d="M8 1V5H12" fill="rgba(0,0,0,0.2)" stroke={color} strokeWidth="0.5" opacity="0.6"/>
    </svg>
  )
}

function FileIconLarge({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
      <path
        d="M3 1H18L27 10V32C27 32.55 26.55 33 26 33H3C2.45 33 2 32.55 2 32V2C2 1.45 2.45 1 3 1Z"
        fill={color} opacity="0.5" stroke={color} strokeWidth="1"
      />
      <path d="M18 1V10H27" fill="rgba(0,0,0,0.2)" stroke={color} strokeWidth="1" opacity="0.5"/>
    </svg>
  )
}

export function FilesNode({ node }: Props): React.ReactElement {
  const { update } = useNodeStore()

  const [currentPath, setCurrentPath] = useState<string>((node.props.path as string) || '')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const historyRef = useRef<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadDir = useCallback(async (dirPath: string, pushHistory: boolean) => {
    if (!dirPath) return
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const result = await window.fs.readDir(dirPath)
      setEntries(result)
      setCurrentPath(dirPath)
      if (pushHistory) {
        historyRef.current = [...historyRef.current, dirPath]
        setHistory([...historyRef.current])
      }
      update(node.id, { title: dirPath.split('/').pop() || dirPath, props: { path: dirPath } })
    } catch (e: any) {
      setError(e?.message ?? 'Failed to read directory')
    } finally {
      setLoading(false)
    }
  }, [node.id, update])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    const savedPath = (node.props.path as string) || ''
    if (savedPath) {
      historyRef.current = [savedPath]
      setHistory([savedPath])
      loadDir(savedPath, false)
    } else {
      window.workspace.homedir().then((home) => {
        historyRef.current = [home]
        setHistory([home])
        loadDir(home, false)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goBack = useCallback(() => {
    const hist = historyRef.current
    if (hist.length <= 1) return
    const newHistory = hist.slice(0, -1)
    historyRef.current = newHistory
    setHistory([...newHistory])
    loadDir(newHistory[newHistory.length - 1], false)
  }, [loadDir])

  const onEntryDoubleClick = useCallback((entry: FsEntry, curPath: string) => {
    if (entry.isDir) {
      loadDir(curPath.replace(/\/$/, '') + '/' + entry.name, true)
    } else {
      window.fs.openFile(curPath.replace(/\/$/, '') + '/' + entry.name)
    }
  }, [loadDir])

  const parts = currentPath.split('/').filter(Boolean)
  const breadcrumbParts = ['/', ...parts]

  const onBreadcrumbClick = useCallback((idx: number) => {
    const path = idx === 0 ? '/' : '/' + parts.slice(0, idx).join('/')
    loadDir(path, true)
  }, [parts, loadDir])

  const tbBtn = (active = false): React.CSSProperties => ({
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    border: 'none', borderRadius: 4,
    color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer', padding: 0, flexShrink: 0,
  })

  return (
    <BaseNode node={node}>
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e0e0e', userSelect: 'none' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#111', flexShrink: 0,
        }}>
          <button onClick={goBack} disabled={history.length <= 1} title="Back" style={tbBtn()}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button onClick={() => loadDir(currentPath, false)} title="Refresh" style={tbBtn()}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M9.5 5.5A4 4 0 1 1 7 2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M7 1v1.5L8.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Breadcrumb */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            padding: '0 8px', height: 24, minWidth: 0,
          }}>
            {breadcrumbParts.map((part, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 2px', fontSize: 11 }}>/</span>}
                <button
                  onClick={() => onBreadcrumbClick(idx)}
                  style={{
                    background: 'none', border: 'none',
                    color: idx === breadcrumbParts.length - 1 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer', padding: '0 2px', fontSize: 11, fontFamily: 'inherit',
                    whiteSpace: 'nowrap', flexShrink: idx < breadcrumbParts.length - 3 ? 1 : 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: idx < breadcrumbParts.length - 1 ? 80 : 200,
                  }}
                  title={part}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            <button onClick={() => setViewMode('list')} title="List view" style={tbBtn(viewMode === 'list')}>
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M4 1.5h7M4 5h7M4 8.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="1.5" cy="1.5" r="1" fill="currentColor"/>
                <circle cx="1.5" cy="5" r="1" fill="currentColor"/>
                <circle cx="1.5" cy="8.5" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={() => setViewMode('grid')} title="Grid view" style={tbBtn(viewMode === 'grid')}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="6" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1" y="6" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="6" y="6" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Column headers — list only */}
        {viewMode === 'list' && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 110px',
            padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
          }}>
            {['Name', 'Size', 'Modified'].map(h => (
              <span key={h} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {loading && (
            <div style={{ padding: '24px', color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center' }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: '16px 12px', color: 'rgba(239,68,68,0.7)', fontSize: 12 }}>
              {error}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div style={{ padding: '24px', color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center' }}>
              Empty folder
            </div>
          )}

          {/* List view */}
          {!loading && !error && viewMode === 'list' && entries.map((entry) => {
            const isSelected = selected === entry.name
            const color = fileColor(entry.name, entry.isDir)
            return (
              <div
                key={entry.name}
                onClick={() => setSelected(entry.name)}
                onDoubleClick={() => onEntryDoubleClick(entry, currentPath)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center',
                  padding: '0 12px', height: 30,
                  cursor: entry.isDir ? 'pointer' : 'default',
                  background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent',
                  borderRadius: 4, margin: '1px 4px',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {entry.isDir ? <FolderIconSmall color={color} /> : <FileIconSmall color={color} />}
                  <span style={{
                    fontSize: 12,
                    color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontVariantNumeric: 'tabular-nums' }}>
                  {entry.isDir ? '—' : formatSize(entry.size)}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(entry.modified)}
                </span>
              </div>
            )
          })}

          {/* Grid view */}
          {!loading && !error && viewMode === 'grid' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: 4, padding: 8,
            }}>
              {entries.map((entry) => {
                const isSelected = selected === entry.name
                const color = fileColor(entry.name, entry.isDir)
                return (
                  <div
                    key={entry.name}
                    onClick={() => setSelected(entry.name)}
                    onDoubleClick={() => onEntryDoubleClick(entry, currentPath)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'flex-start', gap: 6,
                      padding: '10px 6px 8px',
                      background: isSelected ? 'rgba(139,92,246,0.18)' : 'transparent',
                      borderRadius: 6,
                      cursor: entry.isDir ? 'pointer' : 'default',
                      border: isSelected ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {entry.isDir ? <FolderIconLarge color={color} /> : <FileIconLarge color={color} />}
                    <span style={{
                      fontSize: 11,
                      color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      lineHeight: '1.3',
                      maxHeight: '2.6em',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {entry.name}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{
          padding: '4px 12px', borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0, display: 'flex', gap: 8,
        }}>
          <span>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
          {selected && <span>· {selected}</span>}
        </div>
      </div>
    </BaseNode>
  )
}
