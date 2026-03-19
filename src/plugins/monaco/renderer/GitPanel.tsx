import React, { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitFileStatus {
  path: string
  index: string
  working: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
}

interface RawLogCommit {
  hash: string
  fullHash: string
  parents: string[]
  author: string
  subject: string
  refs: string
}

interface ParsedRef {
  name: string
  isHead: boolean
  isLocal: boolean
  isRemote: boolean
  isTag: boolean
}

interface Track { targetHash: string; lane: number; color: string }

interface GraphCommit extends RawLogCommit {
  parsedRefs: ParsedRef[]
  lane: number
  color: string
  hadIncoming: boolean
  parentConns: Array<{ lane: number; color: string }>
  incomingTracks: Array<{ lane: number; color: string }>
  outgoingTracks: Array<{ lane: number; color: string }>
  incomingLaneSet: Set<number>
  laneCount: number
}

interface Props {
  rootPath: string
  onOpenDiff: (filePath: string, original: string | null, modified: string, lang: string) => void
  onRefreshNeeded?: (refresh: () => void) => void
}

// ---------------------------------------------------------------------------
// Graph constants
// ---------------------------------------------------------------------------

const LANE_W = 14
const ROW_H = 24
const DOT_R = 4
const LANE_COLORS = [
  '#5c9cf5', '#f5c842', '#f06292', '#81c784',
  '#ce93d8', '#4dd0e1', '#ff8a65', '#a1887f', '#90a4ae', '#ffb74d',
]

// ---------------------------------------------------------------------------
// Graph layout algorithm
// ---------------------------------------------------------------------------

function parseRefs(refsStr: string): ParsedRef[] {
  if (!refsStr.trim()) return []
  return refsStr.split(',').map(r => r.trim()).filter(Boolean).flatMap(r => {
    if (r.startsWith('HEAD -> '))
      return [{ name: r.slice(8), isHead: true, isLocal: true, isRemote: false, isTag: false }]
    if (r === 'HEAD')
      return [{ name: 'HEAD', isHead: true, isLocal: false, isRemote: false, isTag: false }]
    if (r.startsWith('tag: '))
      return [{ name: r.slice(5), isHead: false, isLocal: false, isRemote: false, isTag: true }]
    const isRemote = r.includes('/')
    return [{ name: r, isHead: false, isLocal: !isRemote, isRemote, isTag: false }]
  })
}

function computeGraph(rawCommits: RawLogCommit[]): GraphCommit[] {
  let tracks: Track[] = []
  let colorIdx = 0

  return rawCommits.map(commit => {
    const trackIdx = tracks.findIndex(t => t.targetHash === commit.fullHash)
    const hadIncoming = trackIdx !== -1

    let myLane: number
    let myColor: string
    if (hadIncoming) {
      myLane = tracks[trackIdx].lane
      myColor = tracks[trackIdx].color
    } else {
      const used = new Set(tracks.map(t => t.lane))
      myLane = 0
      while (used.has(myLane)) myLane++
      myColor = LANE_COLORS[colorIdx++ % LANE_COLORS.length]
    }

    const incomingTracks = tracks.map(t => ({ lane: t.lane, color: t.color }))
    const incomingLaneSet = new Set(incomingTracks.map(t => t.lane))

    const remaining = tracks.filter((_, i) => i !== trackIdx)
    const usedNow = new Set(remaining.map(t => t.lane))
    const parentConns: Array<{ lane: number; color: string }> = []

    for (let i = 0; i < commit.parents.length; i++) {
      const ph = commit.parents[i]
      const existIdx = remaining.findIndex(t => t.targetHash === ph)
      if (existIdx !== -1) {
        // Merge: parent already tracked
        parentConns.push({ lane: remaining[existIdx].lane, color: remaining[existIdx].color })
      } else {
        // New track for this parent
        let newLane: number
        if (i === 0 && !usedNow.has(myLane)) {
          newLane = myLane // first parent inherits commit's lane
        } else {
          newLane = 0
          while (usedNow.has(newLane)) newLane++
        }
        usedNow.add(newLane)
        const newColor = newLane === myLane ? myColor : LANE_COLORS[colorIdx++ % LANE_COLORS.length]
        remaining.push({ targetHash: ph, lane: newLane, color: newColor })
        parentConns.push({ lane: newLane, color: newColor })
      }
    }

    tracks = remaining
    const outgoingTracks = tracks.map(t => ({ lane: t.lane, color: t.color }))
    const laneCount = Math.max(myLane + 1, ...tracks.map(t => t.lane + 1), 1)

    return {
      ...commit,
      parsedRefs: parseRefs(commit.refs),
      lane: myLane,
      color: myColor,
      hadIncoming,
      parentConns,
      incomingTracks,
      outgoingTracks,
      incomingLaneSet,
      laneCount,
    }
  })
}

// ---------------------------------------------------------------------------
// Graph SVG row
// ---------------------------------------------------------------------------

function GraphSvg({ gc, maxLanes }: { gc: GraphCommit; maxLanes: number }) {
  const W = maxLanes * LANE_W
  const H = ROW_H
  const dotY = H / 2
  const cx = (lane: number) => lane * LANE_W + LANE_W / 2

  return (
    <svg width={W} height={H} style={{ flexShrink: 0, overflow: 'visible' }}>
      {/* Top half: incoming tracks (includes commit's lane if hadIncoming) */}
      {gc.incomingTracks.map(t => (
        <line key={`top-${t.lane}`} x1={cx(t.lane)} y1={0} x2={cx(t.lane)} y2={dotY}
          stroke={t.color} strokeWidth={1.5} />
      ))}

      {/* Bottom half: pass-through lanes (not the commit lane, already tracked above) */}
      {gc.outgoingTracks
        .filter(t => t.lane !== gc.lane && gc.incomingLaneSet.has(t.lane))
        .map(t => (
          <line key={`bot-pt-${t.lane}`} x1={cx(t.lane)} y1={dotY} x2={cx(t.lane)} y2={H}
            stroke={t.color} strokeWidth={1.5} />
        ))}

      {/* Bottom half: parent connections */}
      {gc.parentConns.map((pc, i) =>
        pc.lane === gc.lane ? (
          <line key={`bot-same-${i}`} x1={cx(gc.lane)} y1={dotY} x2={cx(gc.lane)} y2={H}
            stroke={gc.color} strokeWidth={1.5} />
        ) : (
          <path key={`curve-${i}`}
            d={`M ${cx(gc.lane)},${dotY} C ${cx(gc.lane)},${H} ${cx(pc.lane)},${dotY} ${cx(pc.lane)},${H}`}
            stroke={pc.color} strokeWidth={1.5} fill="none" />
        )
      )}

      {/* Commit dot */}
      {gc.parentConns.length > 1 ? (
        // Merge commit: open circle with ring
        <>
          <circle cx={cx(gc.lane)} cy={dotY} r={DOT_R + 1} fill="#252526" stroke={gc.color} strokeWidth={1.5} />
          <circle cx={cx(gc.lane)} cy={dotY} r={DOT_R - 1} fill={gc.color} />
        </>
      ) : (
        <circle cx={cx(gc.lane)} cy={dotY} r={DOT_R} fill={gc.color} />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Ref badge
// ---------------------------------------------------------------------------

function RefBadge({ r }: { r: ParsedRef }) {
  const bg = r.isTag ? '#c5a842' : r.isRemote ? '#6699cc' : '#3794ff'
  const label = r.isRemote && r.name.includes('/')
    ? r.name.split('/').slice(1).join('/')
    : r.name
  return (
    <span
      title={r.name}
      style={{
        background: bg, color: '#fff',
        fontSize: 9, fontFamily: 'system-ui', fontWeight: 700,
        padding: '1px 5px', borderRadius: 3,
        whiteSpace: 'nowrap', flexShrink: 0,
        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

function statusBadge(index: string, working: string): { label: string; color: string } {
  const s = index !== ' ' && index !== '?' ? index : working
  if (s === 'M') return { label: 'M', color: '#e2c08d' }
  if (s === 'A') return { label: 'A', color: '#73c991' }
  if (s === 'D') return { label: 'D', color: '#f44747' }
  if (s === 'R') return { label: 'R', color: '#569cd6' }
  if (s === '?') return { label: 'U', color: '#73c991' }
  return { label: s, color: '#888' }
}

function isStaged(f: GitFileStatus): boolean {
  return f.index !== ' ' && f.index !== '?' && f.index !== ''
}
function isUnstaged(f: GitFileStatus): boolean {
  return f.working !== ' ' && f.working !== ''
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  label, open, onToggle, count, children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  count?: number
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 26, paddingLeft: 8, paddingRight: 6,
        background: '#252526', cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid #1e1e1e', flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 9, color: '#888', width: 10, textAlign: 'center', flexShrink: 0, lineHeight: 1 }}>
        {open ? '▾' : '▸'}
      </span>
      <span style={{
        fontSize: 10, color: '#bbb', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        fontFamily: 'system-ui', flex: 1,
      }}>
        {label}
        {count != null && count > 0 && (
          <span style={{ color: '#666', fontWeight: 400, marginLeft: 4 }}>{count}</span>
        )}
      </span>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// File row
// ---------------------------------------------------------------------------

function FileRow({
  file, selected, onClick, action,
}: {
  file: GitFileStatus; selected: boolean; onClick: () => void; action: React.ReactElement
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const { label, color } = statusBadge(file.index, file.working)
  const name = file.path.split('/').pop()!
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 22, paddingLeft: 16, paddingRight: 6,
        background: selected ? '#094771' : hovered ? '#2a2d2e' : 'transparent',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 11, fontFamily: 'system-ui', color: selected ? '#fff' : '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
        {dir && <span style={{ color: '#666', marginLeft: 4 }}>{dir}</span>}
      </span>
      {hovered && action}
      <span style={{ fontSize: 10, color, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, width: 12, textAlign: 'center' }}>{label}</span>
    </div>
  )
}

function ActionBtn({ label, title, onClick }: { label: string; title: string; onClick: (e: React.MouseEvent) => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: '#3c3c3c', border: 'none', borderRadius: 3,
        color: '#ccc', cursor: 'pointer', fontSize: 11, lineHeight: 1,
        padding: '1px 5px', flexShrink: 0, fontFamily: 'monospace',
      }}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Commit row
// ---------------------------------------------------------------------------

function CommitRow({ gc, maxLanes }: { gc: GraphCommit; maxLanes: number }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: ROW_H, paddingRight: 8,
        background: hovered ? '#2a2d2e' : 'transparent',
        cursor: 'default', userSelect: 'none', flexShrink: 0,
      }}
    >
      <GraphSvg gc={gc} maxLanes={maxLanes} />
      <span style={{
        fontSize: 12, fontFamily: 'system-ui', color: '#d4d4d4',
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: gc.parsedRefs.some(r => r.isHead) ? 600 : 400,
      }}>
        {gc.subject}
      </span>
      {gc.parsedRefs.slice(0, 2).map((r, i) => <RefBadge key={i} r={r} />)}
      <span style={{ fontSize: 10, color: '#666', fontFamily: 'system-ui', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {gc.author.split(' ')[0]}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GitPanel({ rootPath, onOpenDiff, onRefreshNeeded }: Props): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [changesOpen, setChangesOpen] = useState(true)
  const [graphOpen, setGraphOpen] = useState(true)
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [splitHeight, setSplitHeight] = useState(200)

  const changesScrollRef = useRef<HTMLDivElement>(null)
  const graphScrollRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ y: 0, h: 0 })

  // Stop wheel events bubbling out of scroll areas
  useEffect(() => {
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.stopPropagation()
    }
    const els = [changesScrollRef.current, graphScrollRef.current]
    els.forEach(el => el?.addEventListener('wheel', stop, { passive: true }))
    return () => els.forEach(el => el?.removeEventListener('wheel', stop))
  }, [])

  // Resize drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientY - dragStart.current.y
      setSplitHeight(Math.max(95, dragStart.current.h + delta))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const onDragHandleDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { y: e.clientY, h: splitHeight }
    e.preventDefault()
  }, [splitHeight])

  const refresh = useCallback(async () => {
    if (!rootPath) return
    setLoading(true)
    try {
      const repo = await window.git.isRepo(rootPath)
      setIsRepo(repo)
      if (repo) {
        const [s, raw] = await Promise.all([
          window.git.status(rootPath),
          window.git.logGraph(rootPath, 150).catch(() => [] as typeof graphCommits),
        ])
        setStatus(s)
        setGraphCommits(computeGraph(raw as RawLogCommit[]))
      }
    } finally {
      setLoading(false)
    }
  }, [rootPath])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { onRefreshNeeded?.(refresh) }, [refresh, onRefreshNeeded])

  const openFile = useCallback(async (file: GitFileStatus) => {
    setSelectedFile(file.path)
    const absPath = file.path.startsWith('/') ? file.path : `${rootPath}/${file.path}`
    const ext = file.path.split('.').pop()?.toLowerCase() ?? ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
      kt: 'kotlin', swift: 'swift', cs: 'csharp', php: 'php', lua: 'lua',
      css: 'css', scss: 'scss', less: 'less', html: 'html',
      json: 'json', md: 'markdown', sh: 'shell', bash: 'shell',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql',
      c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    }
    const lang = langMap[ext] ?? 'plaintext'
    const [original, modified] = await Promise.all([
      window.git.fileAtHead(rootPath, file.path).catch(() => null),
      window.fs.readFile(absPath).catch(() => ''),
    ])
    onOpenDiff(file.path, original, modified, lang)
  }, [rootPath, onOpenDiff])

  const stageFile = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    await window.git.stage(rootPath, [filePath])
    refresh()
  }, [rootPath, refresh])

  const unstageFile = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    await window.git.unstage(rootPath, [filePath])
    refresh()
  }, [rootPath, refresh])

  const discardFile = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    if (!confirm(`Discard changes to ${filePath.split('/').pop()}?`)) return
    await window.git.discard(rootPath, [filePath])
    refresh()
  }, [rootPath, refresh])

  const stageAll = useCallback(async () => {
    if (!status) return
    const paths = status.files.filter(isUnstaged).map(f => f.path)
    if (paths.length) { await window.git.stage(rootPath, paths); refresh() }
  }, [status, rootPath, refresh])

  const commit = useCallback(async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    try {
      await window.git.commit(rootPath, commitMsg.trim())
      setCommitMsg('')
      refresh()
    } finally {
      setCommitting(false)
    }
  }, [commitMsg, rootPath, refresh])

  const stopEvents = (e: React.SyntheticEvent) => e.stopPropagation()

  if (isRepo === false) {
    return (
      <div style={{ padding: 16, color: '#666', fontSize: 12, fontFamily: 'system-ui' }}>
        Not a git repository
      </div>
    )
  }

  const staged = status?.files.filter(isStaged) ?? []
  const unstaged = status?.files.filter(f => !isStaged(f) || isUnstaged(f)) ?? []
  const totalChanges = staged.length + unstaged.length
  const maxLanes = Math.max(...graphCommits.map(g => g.laneCount), 1)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#252526' }}
      onPointerDown={stopEvents}
    >
      {/* ── CHANGES section ───────────────────────────────────────── */}
      <SectionHeader
        label="Changes"
        open={changesOpen}
        onToggle={() => setChangesOpen(v => !v)}
        count={totalChanges}
      >
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span style={{ fontSize: 10, color: '#73c991', fontFamily: 'monospace', background: '#1e1e1e', padding: '1px 5px', borderRadius: 3, marginRight: 2 }}>
            {status.ahead > 0 && `↑${status.ahead}`}
            {status.ahead > 0 && status.behind > 0 && ' '}
            {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); refresh() }}
          disabled={loading}
          title="Refresh"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
        >↻</button>
      </SectionHeader>

      {changesOpen && (
        <div style={{ height: splitHeight, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* Commit box */}
          <div style={{ flexShrink: 0, padding: '6px 8px', borderBottom: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <textarea
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder={`Message (⌘↵ to commit on "${status?.branch ?? 'main'}")`}
              onKeyDown={e => { if (e.metaKey && e.key === 'Enter') commit(); e.stopPropagation() }}
              style={{
                width: '100%', resize: 'none', height: 50,
                background: '#3c3c3c', color: '#ccc',
                border: '1px solid #555', borderRadius: 3,
                padding: '5px 7px', fontSize: 11,
                fontFamily: 'system-ui', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={commit}
              disabled={!commitMsg.trim() || committing}
              style={{
                background: commitMsg.trim() ? '#0e639c' : '#2a2d2e',
                color: commitMsg.trim() ? '#fff' : '#555',
                border: 'none', borderRadius: 3, padding: '5px 8px',
                fontSize: 11, cursor: commitMsg.trim() ? 'pointer' : 'default',
                fontFamily: 'system-ui', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span style={{ fontSize: 11 }}>✓</span>
              {committing ? 'Committing…' : 'Commit'}
            </button>
          </div>

          {/* File lists — scrollable, fills remaining split height */}
          <div ref={changesScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            {staged.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', height: 22, paddingLeft: 12, paddingRight: 8, background: '#252526' }}>
                  <span style={{ fontSize: 10, color: '#bbb', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'system-ui', flex: 1 }}>
                    Staged <span style={{ color: '#666' }}>{staged.length}</span>
                  </span>
                  <button onClick={async () => { await window.git.unstage(rootPath, staged.map(f => f.path)); refresh() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#569cd6', fontSize: 10, padding: '0 2px', fontFamily: 'system-ui' }}>
                    Unstage All
                  </button>
                </div>
                {staged.map(f => (
                  <FileRow key={`s-${f.path}`} file={f} selected={selectedFile === f.path}
                    onClick={() => openFile(f)}
                    action={<ActionBtn label="−" title="Unstage" onClick={e => unstageFile(e, f.path)} />}
                  />
                ))}
              </>
            )}

            {unstaged.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', height: 22, paddingLeft: 12, paddingRight: 8, background: '#252526' }}>
                  <span style={{ fontSize: 10, color: '#bbb', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'system-ui', flex: 1 }}>
                    Changes <span style={{ color: '#666' }}>{unstaged.length}</span>
                  </span>
                  <button onClick={stageAll}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#569cd6', fontSize: 10, padding: '0 2px', fontFamily: 'system-ui' }}>
                    Stage All
                  </button>
                </div>
                {unstaged.map(f => (
                  <FileRow key={`u-${f.path}`} file={f} selected={selectedFile === f.path}
                    onClick={() => openFile(f)}
                    action={
                      <>
                        <ActionBtn label="↺" title="Discard changes" onClick={e => discardFile(e, f.path)} />
                        <ActionBtn label="+" title="Stage" onClick={e => stageFile(e, f.path)} />
                      </>
                    }
                  />
                ))}
              </>
            )}

            {status && totalChanges === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontFamily: 'system-ui' }}>
                No changes
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Resize handle (only when both open) ───────────────────── */}
      {changesOpen && graphOpen && (
        <div
          onMouseDown={onDragHandleDown}
          style={{
            height: 5, background: '#1e1e1e', cursor: 'ns-resize',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ width: 28, height: 2, background: '#3c3c3c', borderRadius: 1 }} />
        </div>
      )}

      {/* ── GRAPH section ─────────────────────────────────────────── */}
      <SectionHeader
        label="Graph"
        open={graphOpen}
        onToggle={() => setGraphOpen(v => !v)}
        count={graphCommits.length > 0 ? graphCommits.length : undefined}
      />

      {graphOpen && (
        <div
          ref={graphScrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
        >
          {graphCommits.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontFamily: 'system-ui' }}>
              {loading ? 'Loading…' : 'No commits'}
            </div>
          ) : (
            graphCommits.map(gc => (
              <CommitRow key={gc.fullHash} gc={gc} maxLanes={maxLanes} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
