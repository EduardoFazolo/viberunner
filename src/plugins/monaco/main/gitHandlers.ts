import simpleGit from 'simple-git'
import type { IpcMainLike } from '../../types'

const gitCache = new Map<string, ReturnType<typeof simpleGit>>()

function git(rootPath: string) {
  if (!gitCache.has(rootPath)) gitCache.set(rootPath, simpleGit(rootPath))
  return gitCache.get(rootPath)!
}

export function registerGitHandlers(ipc: IpcMainLike): void {
  ipc.handle('git:isRepo', async (_e, rootPath: string): Promise<boolean> => {
    try { await git(rootPath).revparse(['--git-dir']); return true } catch { return false }
  })

  ipc.handle('git:status', async (_e, rootPath: string) => {
    try {
      const s = await git(rootPath).status()
      return {
        branch: s.current || 'HEAD',
        ahead: s.ahead,
        behind: s.behind,
        files: s.files.map(f => ({ path: f.path, index: f.index || ' ', working: f.working_dir || ' ' })),
      }
    } catch { return { branch: '', ahead: 0, behind: 0, files: [] } }
  })

  ipc.handle('git:fileAtHead', async (_e, rootPath: string, filePath: string): Promise<string | null> => {
    try {
      const rel = filePath.startsWith(rootPath) ? filePath.slice(rootPath.length).replace(/^\//, '') : filePath
      return await git(rootPath).show([`HEAD:${rel}`])
    } catch { return null }
  })

  ipc.handle('git:diff', async (_e, rootPath: string, filePath: string, staged: boolean): Promise<string> => {
    try {
      return staged
        ? await git(rootPath).diff(['--cached', '--', filePath])
        : await git(rootPath).diff(['--', filePath])
    } catch { return '' }
  })

  ipc.handle('git:stage', async (_e, rootPath: string, filePaths: string[]): Promise<void> => {
    try { await git(rootPath).add(filePaths) } catch (e) { console.error('[git:stage]', e) }
  })

  ipc.handle('git:unstage', async (_e, rootPath: string, filePaths: string[]): Promise<void> => {
    try { await git(rootPath).reset(['HEAD', '--', ...filePaths]) } catch (e) { console.error('[git:unstage]', e) }
  })

  ipc.handle('git:commit', async (_e, rootPath: string, message: string): Promise<void> => {
    await git(rootPath).commit(message)
  })

  ipc.handle('git:log', async (_e, rootPath: string, maxCount = 50) => {
    try {
      const r = await git(rootPath).log({ maxCount })
      return r.all.map(e => ({ hash: e.hash.slice(0, 7), date: e.date, message: e.message, author: e.author_name }))
    } catch { return [] }
  })

  ipc.handle('git:logGraph', async (_e, rootPath: string, maxCount = 150) => {
    try {
      const output = await git(rootPath).raw([
        'log', '--all', `--max-count=${maxCount}`,
        '--pretty=format:%H|%P|%an|%s|%D',
      ])
      if (!output.trim()) return []
      return output.trim().split('\n').map(line => {
        const i1 = line.indexOf('|')
        const i2 = line.indexOf('|', i1 + 1)
        const i3 = line.indexOf('|', i2 + 1)
        const i4 = line.indexOf('|', i3 + 1)
        const fullHash = line.slice(0, i1)
        const parentsStr = line.slice(i1 + 1, i2)
        return {
          hash: fullHash.slice(0, 7),
          fullHash,
          parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
          author: line.slice(i2 + 1, i3),
          subject: line.slice(i3 + 1, i4),
          refs: line.slice(i4 + 1),
        }
      })
    } catch { return [] }
  })
}
