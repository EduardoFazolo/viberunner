import React, { useCallback, useEffect, useRef, useState } from 'react'

interface FileEntry {
  name: string
  relativePath: string
  absolutePath: string
  lang: string
}

interface Props {
  rootPath: string
  onSelect: (absolutePath: string, lang: string) => void
  onClose: () => void
}

const IGNORED = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'out', 'target', '__pycache__', '.DS_Store', 'coverage', '.turbo', '.cache'])

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
  kt: 'kotlin', swift: 'swift', cs: 'csharp', php: 'php', lua: 'lua',
  css: 'css', scss: 'scss', less: 'less', html: 'html',
  json: 'json', md: 'markdown', sh: 'shell', bash: 'shell', zsh: 'shell',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
}

function getLang(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return EXT_LANG[ext] ?? 'plaintext'
}

async function buildIndex(rootPath: string, rel = '', depth = 0): Promise<FileEntry[]> {
  if (depth > 8) return []
  const items = await window.fs.readDir(rootPath + (rel ? `/${rel}` : '')).catch(() => [])
  const results: FileEntry[] = []
  for (const item of items) {
    if (IGNORED.has(item.name)) continue
    const relPath = rel ? `${rel}/${item.name}` : item.name
    const absPath = `${rootPath}/${relPath}`
    if (item.isDir) {
      const children = await buildIndex(rootPath, relPath, depth + 1)
      results.push(...children)
    } else {
      results.push({ name: item.name, relativePath: relPath, absolutePath: absPath, lang: getLang(item.name) })
    }
  }
  return results
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return 1000 - t.indexOf(q)
  let qi = 0
  let score = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { score += 10; qi++ }
  }
  return qi === q.length ? score : -1
}

export function SearchOverlay({ rootPath, onSelect, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [results, setResults] = useState<FileEntry[]>([])
  const [cursor, setCursor] = useState(0)
  const [indexing, setIndexing] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    setIndexing(true)
    buildIndex(rootPath).then(f => { setFiles(f); setIndexing(false) })
  }, [rootPath])

  useEffect(() => {
    if (!query.trim()) {
      setResults(files.slice(0, 50))
      setCursor(0)
      return
    }
    const scored = files
      .map(f => ({ f, score: Math.max(fuzzyScore(query, f.name), fuzzyScore(query, f.relativePath)) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(x => x.f)
    setResults(scored)
    setCursor(0)
  }, [query, files])

  const select = useCallback((entry: FileEntry) => {
    onSelect(entry.absolutePath, entry.lang)
    onClose()
  }, [onSelect, onClose])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { setCursor(c => Math.min(c + 1, results.length - 1)); e.preventDefault() }
    if (e.key === 'ArrowUp') { setCursor(c => Math.max(c - 1, 0)); e.preventDefault() }
    if (e.key === 'Enter' && results[cursor]) { select(results[cursor]) }
  }, [results, cursor, select, onClose])

  useEffect(() => {
    const row = listRef.current?.children[cursor] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const highlightMatch = (text: string, q: string): React.ReactElement => {
    if (!q.trim()) return <>{text}</>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return <>{text}</>
    return <>{text.slice(0, idx)}<mark style={{ background: '#f9c74f', color: '#1e1e1e', borderRadius: 1 }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 48,
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 480, maxHeight: 400,
        background: '#252526', borderRadius: 6,
        border: '1px solid #454545',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #3c3c3c' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Go to file…"
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#d4d4d4', fontSize: 13, fontFamily: 'system-ui',
            }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 340 }}>
          {indexing ? (
            <div style={{ padding: 12, color: '#666', fontSize: 12, fontFamily: 'system-ui' }}>Indexing files…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 12, color: '#666', fontSize: 12, fontFamily: 'system-ui' }}>No results</div>
          ) : results.map((entry, i) => (
            <div
              key={entry.absolutePath}
              onMouseDown={() => select(entry)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px', cursor: 'pointer',
                background: i === cursor ? '#094771' : 'transparent',
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <span style={{ fontSize: 12, color: '#d4d4d4', fontFamily: 'system-ui', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {highlightMatch(entry.name, query)}
              </span>
              <span style={{ fontSize: 11, color: '#666', fontFamily: 'system-ui', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.relativePath.includes('/') ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/')) : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
