import type { TrelloCard } from '../main/handlers'

function formatDue(due: string | null): string | null {
  if (!due) return null
  try {
    return new Date(due).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return due
  }
}

function text(content: string): any {
  return { type: 'text', text: content }
}

function paragraph(children: any[]): any {
  return { type: 'paragraph', content: children }
}

function heading(level: number, content: string): any {
  return { type: 'heading', attrs: { level }, content: [text(content)] }
}

/**
 * Converts a Trello card into a TipTap document.
 * Structure: Title (h1) → Labels → Due → Description paragraphs → Checklists
 */
export function trelloCardToTiptap(card: TrelloCard): any {
  const content: any[] = []

  // Title
  content.push(heading(1, card.name))

  // Labels
  if (card.labels.length > 0) {
    const labelText = card.labels.map((l) => l.name || l.color).filter(Boolean).join('  ·  ')
    content.push(paragraph([
      { type: 'text', text: 'Labels: ', marks: [{ type: 'bold' }] },
      text(labelText),
    ]))
  }

  // Due date
  const due = formatDue(card.due)
  if (due) {
    content.push(paragraph([
      { type: 'text', text: 'Due: ', marks: [{ type: 'bold' }] },
      text(due),
    ]))
  }

  // Description — split by newlines into paragraphs
  const desc = card.desc.trim()
  if (desc) {
    for (const line of desc.split('\n')) {
      content.push(
        line.trim()
          ? paragraph([text(line)])
          : { type: 'paragraph' },
      )
    }
  }

  // Checklists
  for (const checklist of card.checklists) {
    content.push(heading(2, checklist.name))
    if (checklist.checkItems.length > 0) {
      content.push({
        type: 'bulletList',
        content: checklist.checkItems.map((item) => ({
          type: 'listItem',
          content: [paragraph([text(`${item.state === 'complete' ? '✓ ' : '○ '}${item.name}`)])],
        })),
      })
    }
  }

  return { type: 'doc', content }
}
