import React, { useCallback, useEffect, useRef, useState } from 'react'

interface BranchEntry {
  name: string
  author: string
  subject: string
  timeAgo: string
  isCurrent: boolean
}

interface Props {
  rootPath: string
  currentBranch: string
  onClose: () => void
  onCheckedOut: (branch: string) => void
}

export function BranchPicker({ rootPath, currentBranch, onClose, onCheckedOut }: Props): React.ReactElement {
  const [branches, setBranches] = useState<BranchEntry[]>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    setIndexing(true)
    window.git.branches(rootPath)
      .then(b => { setBranches(b); setIndexing(false) })
      .catch(() => setIndexing(false))
  }, [rootPath])

  const filtered = query.trim()
    ? branches.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : branches

  const checkout = useCallback(async (name: string, createNew = false) => {
    if (loading) return
    setLoading(true)
    try {
      await window.git.checkoutBranch(rootPath, name, createNew)
      onCheckedOut(name)
      onClose()
    } catch (e) {
      console.error('[BranchPicker] checkout failed:', e)
      setLoading(false)
    }
  }, [rootPath, onCheckedOut, onClose, loading])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { onClose(); return }
    if (creating) return
    const total = filtered.length + 1 // +1 for "create" option at top
    if (e.key === 'ArrowDown') { setCursor(c => Math.min(c + 1, total - 1)); e.preventDefault() }
    if (e.key === 'ArrowUp') { setCursor(c => Math.max(c - 1, 0)); e.preventDefault() }
    if (e.key === 'Enter') {
      if (cursor === 0) {
        setCreating(true)
        setNewName(query)
      } else {
        const b = filtered[cursor - 1]
        if (b) checkout(b.name)
      }
    }
  }, [creating, filtered, cursor, query, checkout, onClose])

  useEffect(() => {
    const row = listRef.current?.children[cursor] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const onNewBranchKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { setCreating(false); inputRef.current?.focus(); return }
    if (e.key === 'Enter' && newName.trim()) checkout(newName.trim(), true)
  }, [newName, checkout])

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        pointerEvents: 'all',
      }}
      onPointerDown={onClose}
    >
      <div
        onPointerDown={e => e.stopPropagation()}
        style={{
          width: 480, maxHeight: '60vh',
          background: '#252526', border: '1px solid #454545',
          borderRadius: '0 0 6px 6px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header: select or create input */}
        {creating ? (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #3c3c3c' }}>
            <div style={{ fontSize: 10, color: '#888', fontFamily: 'system-ui', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Branch name
            </div>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={onNewBranchKeyDown}
              placeholder="feature/my-branch"
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: '#d4d4d4', fontSize: 13, fontFamily: 'system-ui', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 10, color: '#555', fontFamily: 'system-ui', marginTop: 4 }}>↵ to create and switch · Esc to cancel</div>
          </div>
        ) : (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #3c3c3c' }}>
            <div style={{ fontSize: 10, color: '#888', fontFamily: 'system-ui', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Select a branch or tag to checkout
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setCursor(0) }}
              onKeyDown={onKeyDown}
              placeholder="Filter branches…"
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: '#d4d4d4', fontSize: 13, fontFamily: 'system-ui', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* List */}
        {!creating && (
          <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 400 }}>
            {/* Create new branch option */}
            <div
              onMouseDown={() => { setCreating(true); setNewName(query) }}
              onMouseEnter={() => setCursor(0)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', cursor: 'pointer',
                background: cursor === 0 ? '#094771' : 'transparent',
                borderBottom: '1px solid #2a2d2e',
              }}
            >
              <span style={{ fontSize: 12, color: '#569cd6', fontFamily: 'system-ui' }}>+</span>
              <span style={{ fontSize: 12, color: cursor === 0 ? '#fff' : '#d4d4d4', fontFamily: 'system-ui' }}>
                Create new branch{query.trim() ? `: "${query.trim()}"` : '…'}
              </span>
            </div>

            {/* Branch list */}
            {filtered.map((b, i) => (
              <div
                key={b.name}
                onMouseDown={() => checkout(b.name)}
                onMouseEnter={() => setCursor(i + 1)}
                style={{
                  padding: '6px 12px', cursor: 'pointer',
                  background: cursor === i + 1 ? '#094771' : 'transparent',
                  borderBottom: '1px solid #1e1e1e',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {b.isCurrent && (
                    <span style={{ fontSize: 10, color: '#73c991', flexShrink: 0 }}>✓</span>
                  )}
                  <span style={{ fontSize: 8, color: '#888', flexShrink: 0 }}>⎇</span>
                  <span style={{
                    fontSize: 12, fontFamily: 'system-ui', fontWeight: 500,
                    color: b.isCurrent ? '#73c991' : (cursor === i + 1 ? '#fff' : '#d4d4d4'),
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {b.name}
                  </span>
                  <span style={{ fontSize: 10, color: '#666', fontFamily: 'system-ui', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {b.timeAgo}
                  </span>
                </div>
                {(b.author || b.subject) && (
                  <div style={{ fontSize: 11, color: '#666', fontFamily: 'system-ui', marginTop: 1, paddingLeft: b.isCurrent ? 22 : 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.author && <span style={{ color: '#555' }}>{b.author.split(' ')[0]}</span>}
                    {b.author && b.subject && <span style={{ color: '#444' }}> • </span>}
                    {b.subject}
                  </div>
                )}
              </div>
            ))}

            {indexing && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontFamily: 'system-ui' }}>
                Loading branches…
              </div>
            )}
            {!indexing && filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontFamily: 'system-ui' }}>
                {query ? `No branches match "${query}"` : 'No local branches found'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
