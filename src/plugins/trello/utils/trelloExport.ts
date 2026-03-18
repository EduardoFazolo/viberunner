import type { TrelloCard } from '../main/handlers'

function formatDue(due: string | null): string | null {
  if (!due) return null
  try {
    return new Date(due).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return due
  }
}

export function buildTrelloExport(card: TrelloCard): { text: string; markdown: string } {
  const lines: string[] = []

  lines.push(`# ${card.name}`)
  lines.push('')

  if (card.labels.length > 0) {
    const labelStr = card.labels.map((l) => l.name || l.color).filter(Boolean).join(', ')
    lines.push(`**Labels:** ${labelStr}`)
    lines.push('')
  }

  const due = formatDue(card.due)
  if (due) {
    lines.push(`**Due:** ${due}`)
    lines.push('')
  }

  if (card.desc.trim()) {
    lines.push(card.desc.trim())
    lines.push('')
  }

  for (const checklist of card.checklists) {
    lines.push(`## ${checklist.name}`)
    lines.push('')
    for (const item of checklist.checkItems) {
      const check = item.state === 'complete' ? '[x]' : '[ ]'
      lines.push(`- ${check} ${item.name}`)
    }
    lines.push('')
  }

  lines.push(`[View on Trello](${card.url})`)

  const markdown = lines.join('\n')

  // Plain text version (same but without markdown syntax)
  const textLines: string[] = []
  textLines.push(card.name)
  textLines.push('')
  if (card.labels.length > 0) {
    textLines.push(`Labels: ${card.labels.map((l) => l.name || l.color).filter(Boolean).join(', ')}`)
    textLines.push('')
  }
  if (due) {
    textLines.push(`Due: ${due}`)
    textLines.push('')
  }
  if (card.desc.trim()) {
    textLines.push(card.desc.trim())
    textLines.push('')
  }
  for (const checklist of card.checklists) {
    textLines.push(checklist.name + ':')
    for (const item of checklist.checkItems) {
      const check = item.state === 'complete' ? '✓' : '○'
      textLines.push(`  ${check} ${item.name}`)
    }
    textLines.push('')
  }

  return { text: textLines.join('\n').trim(), markdown }
}
