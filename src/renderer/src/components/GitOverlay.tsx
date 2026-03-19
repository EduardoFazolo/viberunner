/**
 * GitOverlay — a floating git panel anchored to the bottom-left of the canvas area.
 * It appears whenever the focused node has a detectable git repository,
 * and provides: branch info, changed-file links, stage-all, commit, and push.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, ArrowUpFromLine, GitCommitHorizontal, Plus, X, ChevronDown, ChevronUp, Loader2, Check, AlertCircle } from 'lucide-react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
// Extension → Monaco language ID
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', markdown: 'markdown',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml', tf: 'hcl', lua: 'lua',
}
function fileLang(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function joinPath(base: string, rel: string): string {
  return base.replace(/\/$/, '') + '/' + rel
}

// ─── Inject keyframes once ────────────────────────────────────────────────────
let _injected = false
function injectStyles() {
  if (_injected) return
  _injected = true
  const s = document.createElement('style')
  s.textContent = `
    @keyframes git-slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes git-slide-down {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(12px); }
    }
    @keyframes git-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes git-pop-in {
      from { opacity: 0; transform: scale(0.95) translateY(4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
  `
  document.head.appendChild(s)
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GitFile {
  path: string
  index: string
  working: string
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
}

type ActionState = 'idle' | 'loading' | 'success' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a usable working-directory path from a focused node */
function getNodePath(node: { type: string; props: Record<string, unknown> }): string | null {
  if (node.type === 'terminal') return (node.props.cwd as string) || null
  if (node.type === 'monaco')   return (node.props.rootPath as string) || null
  if (node.type === 'files')    return (node.props.rootPath as string) || null
  return null
}

/** Color-code a file status character */
function statusColor(ch: string): string {
  if (ch === 'M') return '#fbbf24'   // modified — amber
  if (ch === 'A') return '#4ade80'   // added — green
  if (ch === 'D') return '#f87171'   // deleted — red
  if (ch === 'R') return '#60a5fa'   // renamed — blue
  if (ch === '?') return 'rgba(255,255,255,0.35)'  // untracked
  return 'rgba(255,255,255,0.4)'
}

function statusLabel(f: GitFile): string {
  const i = f.index.trim()
  const w = f.working.trim()
  if (i === '?' && w === '?') return 'U'    // untracked
  if (i !== '' && i !== ' ') return i       // staged status
  return w || ' '
}

function statusChar(f: GitFile): { char: string; color: string; staged: boolean } {
  const i = f.index.trim()
  const w = f.working.trim()
  const staged = i !== '' && i !== ' ' && i !== '?'
  const ch = staged ? i : (w !== '' ? w : ' ')
  return { char: ch, color: statusColor(ch), staged }
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

function fileDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface FileRowProps {
  file: GitFile
  gitPath: string
  onOpenDiff: (filePath: string, gitPath: string) => void
}

function FileRow({ file, gitPath, onOpenDiff }: FileRowProps): React.ReactElement {
  const { char, color, staged } = statusChar(file)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={() => onOpenDiff(file.path, gitPath)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={file.path}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 12px',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        transition: 'background 0.1s ease',
        minWidth: 0,
      }}
    >
      {/* Status badge */}
      <span style={{
        width: 16, height: 16,
        borderRadius: 4,
        background: color + '22',
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        color,
        flexShrink: 0,
        fontFamily: 'ui-monospace, Menlo, monospace',
        letterSpacing: 0,
        opacity: staged ? 1 : 0.75,
      }}>
        {char}
      </span>

      {/* File path */}
      <span style={{
        fontSize: 11,
        color: hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)',
        fontFamily: 'ui-monospace, Menlo, monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
        flex: 1,
        transition: 'color 0.1s ease',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
          {fileDir(file.path)}
        </span>
        {fileName(file.path)}
      </span>

      {/* Staged indicator */}
      {staged && (
        <span style={{
          fontSize: 9,
          color: '#4ade80',
          background: '#4ade8018',
          border: '1px solid #4ade8033',
          borderRadius: 3,
          padding: '1px 4px',
          flexShrink: 0,
          fontFamily: 'ui-monospace, Menlo, monospace',
          letterSpacing: '0.04em',
        }}>
          staged
        </span>
      )}
    </div>
  )
}

interface ActionButtonProps {
  onClick: () => void
  disabled?: boolean
  state?: ActionState
  icon: React.ReactNode
  label: string
  accent?: string
}

function ActionButton({ onClick, disabled, state = 'idle', icon, label, accent }: ActionButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  const isError = state === 'error'
  const isDisabled = disabled || isLoading

  const bg = isError
    ? 'rgba(248,113,113,0.12)'
    : isSuccess
      ? 'rgba(74,222,128,0.12)'
      : hovered && !isDisabled
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(255,255,255,0.04)'

  const border = isError
    ? '1px solid rgba(248,113,113,0.3)'
    : isSuccess
      ? '1px solid rgba(74,222,128,0.3)'
      : `1px solid rgba(255,255,255,${hovered && !isDisabled ? '0.12' : '0.07'})`

  const color = isError
    ? '#f87171'
    : isSuccess
      ? '#4ade80'
      : isDisabled
        ? 'rgba(255,255,255,0.2)'
        : accent ?? 'rgba(255,255,255,0.65)'

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '6px 8px',
        background: bg,
        border,
        borderRadius: 7,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        color,
        fontSize: 11,
        fontWeight: 500,
        transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
        outline: 'none',
        letterSpacing: '0.01em',
      }}
    >
      {isLoading
        ? <Loader2 size={12} style={{ animation: 'git-spin 0.8s linear infinite', flexShrink: 0 }} />
        : isSuccess
          ? <Check size={12} style={{ flexShrink: 0 }} />
          : isError
            ? <AlertCircle size={12} style={{ flexShrink: 0 }} />
            : <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      }
      <span>{isSuccess ? 'Done' : isError ? 'Error' : label}</span>
    </button>
  )
}

// ─── Commit Modal ─────────────────────────────────────────────────────────────

interface CommitModalProps {
  gitPath: string
  onClose: () => void
  onCommitted: () => void
}

function CommitModal({ gitPath, onClose, onCommitted }: CommitModalProps): React.ReactElement {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<ActionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const commit = async () => {
    if (!message.trim() || state === 'loading') return
    setState('loading')
    setError(null)
    try {
      await window.git.commit(gitPath, message.trim())
      setState('success')
      setTimeout(() => {
        onCommitted()
        onClose()
      }, 800)
    } catch (e: any) {
      setState('error')
      setError(e?.message ?? 'Commit failed')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    /* Backdrop */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: 400,
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        animation: 'git-pop-in 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitCommitHorizontal size={14} color='rgba(255,255,255,0.5)' />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>
              Commit changes
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', padding: 2, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Commit message…'
            rows={4}
            style={{
              width: '100%',
              background: '#0d0d0d',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 13,
              fontFamily: 'ui-monospace, Menlo, monospace',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          {error && (
            <div style={{
              marginTop: 8, fontSize: 11,
              color: '#f87171',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>
              {error}
            </div>
          )}
          <div style={{
            display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', flex: 1 }}>
              ⌘↵ to commit
            </span>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!message.trim() || state === 'loading'}
              style={{
                padding: '6px 16px',
                background: state === 'success' ? '#4ade8022' : '#a78bfa22',
                border: `1px solid ${state === 'success' ? '#4ade8044' : '#a78bfa44'}`,
                borderRadius: 7,
                color: state === 'success' ? '#4ade80' : '#a78bfa',
                cursor: (!message.trim() || state === 'loading') ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 500,
                opacity: !message.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              {state === 'loading' && <Loader2 size={12} style={{ animation: 'git-spin 0.8s linear infinite' }} />}
              {state === 'success' ? 'Committed!' : 'Commit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main GitOverlay component ────────────────────────────────────────────────

export function GitOverlay(): React.ReactElement | null {
  useEffect(() => { injectStyles() }, [])

  const { focusedNodeId, nodes } = useNodeStore()
  const focusedNode = focusedNodeId ? nodes.get(focusedNodeId) : null
  const gitPath = focusedNode ? getNodePath(focusedNode) : null

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [isRepo, setIsRepo] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [stageState, setStageState] = useState<ActionState>('idle')
  const [pushState, setPushState] = useState<ActionState>('idle')
  const [visible, setVisible] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPathRef = useRef<string | null>(null)

  const fetchStatus = useCallback(async (path: string) => {
    try {
      const s = await window.git.status(path)
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }, [])

  // When gitPath changes, check if it's a repo and start polling
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

    if (!gitPath) {
      setVisible(false)
      setIsRepo(false)
      setStatus(null)
      prevPathRef.current = null
      return
    }

    if (gitPath === prevPathRef.current) return
    prevPathRef.current = gitPath

    // Check if it's a git repo
    window.git.isRepo(gitPath).then((yes) => {
      if (!yes) {
        setVisible(false)
        setIsRepo(false)
        setStatus(null)
        return
      }
      setIsRepo(true)
      setVisible(true)
      fetchStatus(gitPath)
      pollRef.current = setInterval(() => fetchStatus(gitPath), 3000)
    })

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [gitPath, fetchStatus])

  // ── Actions ───────────────────────────────────────────────────────────────

  const stageAll = async () => {
    if (!gitPath || !status || stageState === 'loading') return
    setStageState('loading')
    try {
      const unstaged = status.files.map((f) => f.path)
      await window.git.stage(gitPath, unstaged)
      setStageState('success')
      await fetchStatus(gitPath)
      setTimeout(() => setStageState('idle'), 1500)
    } catch {
      setStageState('error')
      setTimeout(() => setStageState('idle'), 2000)
    }
  }

  const push = async () => {
    if (!gitPath || pushState === 'loading') return
    setPushState('loading')
    setPushError(null)
    try {
      const result = await window.git.push(gitPath)
      if (result?.error) {
        setPushState('error')
        setPushError(result.error)
        setTimeout(() => { setPushState('idle'); setPushError(null) }, 3000)
      } else {
        setPushState('success')
        await fetchStatus(gitPath)
        setTimeout(() => setPushState('idle'), 2000)
      }
    } catch (e: any) {
      setPushState('error')
      setPushError(e?.message ?? 'Push failed')
      setTimeout(() => { setPushState('idle'); setPushError(null) }, 3000)
    }
  }

  const openDiff = useCallback(async (filePath: string, rootPath: string) => {
    const lang = fileLang(filePath)
    const fullPath = joinPath(rootPath, filePath)

    // Fetch both sides of the diff in parallel
    const [original, modified] = await Promise.all([
      window.git.fileAtHead(rootPath, filePath).catch(() => null),
      window.fs.readFile(fullPath).catch(() => ''),
    ])

    const { nodes: allNodes, add, update, setFocusedNodeId, bringToFront } = useNodeStore.getState()
    const { camera } = useCameraStore.getState()

    const pendingDiff = { path: fullPath, original, modified, lang }

    // Find existing Monaco node with same rootPath
    const existing = Array.from(allNodes.values()).find(
      (n) => n.type === 'monaco' && n.props.rootPath === rootPath
    )

    if (existing) {
      update(existing.id, { props: { ...existing.props, pendingDiff } })
      bringToFront(existing.id)
      setFocusedNodeId(existing.id)
    } else {
      // Create new Monaco node in the visible canvas area
      const cx = (-camera.x + window.innerWidth * 0.5) / camera.zoom
      const cy = (-camera.y + window.innerHeight * 0.5) / camera.zoom
      const newNode = add('monaco', cx - 500, cy - 320, { rootPath, pendingDiff })
      setFocusedNodeId(newNode.id)
      bringToFront(newNode.id)
    }
  }, [])

  if (!visible || !isRepo || !status || !gitPath) return null

  const hasChanges = status.files.length > 0
  const stagedCount = status.files.filter((f) => {
    const i = f.index.trim()
    return i !== '' && i !== ' ' && i !== '?'
  }).length

  return (
    <>
      {/* Overlay panel */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          width: 406,
          zIndex: 500,
          background: 'rgba(13, 13, 13, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'git-slide-up 0.22s cubic-bezier(0.2, 0, 0, 1)',
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <div
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            cursor: 'pointer',
            borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Branch icon */}
          <GitBranch size={13} color='#a78bfa' style={{ flexShrink: 0 }} />

          {/* Branch name */}
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#a78bfa',
            fontFamily: 'ui-monospace, Menlo, monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {status.branch}
          </span>

          {/* Ahead/behind */}
          {(status.ahead > 0 || status.behind > 0) && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {status.ahead > 0 && (
                <span style={{ fontSize: 10, color: '#4ade80', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  ↑{status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  ↓{status.behind}
                </span>
              )}
            </div>
          )}

          {/* File count badge */}
          {hasChanges && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 4,
              padding: '1px 6px',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>
              {status.files.length}
            </span>
          )}

          {/* Collapse toggle */}
          <span style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' }}>
            {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>

        {/* Body */}
        {!collapsed && (
          <>
            {/* File list */}
            {hasChanges ? (
              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                padding: '4px 0',
                // Subtle scrollbar
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.1) transparent',
              } as React.CSSProperties}>
                {status.files.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    gitPath={gitPath}
                    onOpenDiff={openDiff}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: '12px',
                fontSize: 11,
                color: 'rgba(255,255,255,0.25)',
                fontFamily: 'ui-monospace, Menlo, monospace',
                textAlign: 'center',
              }}>
                No changes
              </div>
            )}

            {/* Push error message */}
            {pushError && (
              <div style={{
                padding: '6px 12px',
                fontSize: 10,
                color: '#f87171',
                fontFamily: 'ui-monospace, Menlo, monospace',
                background: 'rgba(248,113,113,0.06)',
                borderTop: '1px solid rgba(248,113,113,0.15)',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}>
                {pushError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              gap: 6,
              padding: '8px 10px 10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <ActionButton
                onClick={stageAll}
                disabled={!hasChanges}
                state={stageState}
                icon={<Plus size={12} />}
                label={stagedCount > 0 ? `Stage all (${stagedCount})` : 'Stage all'}
                accent='rgba(255,255,255,0.6)'
              />
              <ActionButton
                onClick={() => setCommitOpen(true)}
                disabled={stagedCount === 0}
                icon={<GitCommitHorizontal size={12} />}
                label='Commit'
                accent='#a78bfa'
              />
              <ActionButton
                onClick={push}
                state={pushState}
                icon={<ArrowUpFromLine size={12} />}
                label='Push'
                accent={status.ahead > 0 ? '#4ade80' : 'rgba(255,255,255,0.55)'}
              />
            </div>
          </>
        )}
      </div>

      {/* Commit modal */}
      {commitOpen && gitPath && (
        <CommitModal
          gitPath={gitPath}
          onClose={() => setCommitOpen(false)}
          onCommitted={() => fetchStatus(gitPath)}
        />
      )}
    </>
  )
}
