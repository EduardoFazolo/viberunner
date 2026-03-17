import { describe, it, expect } from 'vitest'
import {
  notionChunkToTiptap,
  IMAGE_LOADING_PLACEHOLDER,
} from '../plugins/notion/utils/notionToTiptap'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Notion recordMap with the given blocks keyed by their id. */
function makeChunk(blocks: Record<string, any>) {
  return { recordMap: { block: blocks } }
}

/** A page block wrapping a list of child block ids. */
function pageBlock(id: string, children: string[], title?: string) {
  return {
    [id]: {
      value: {
        id,
        type: 'page',
        properties: title ? { title: [[title]] } : undefined,
        content: children,
      },
    },
  }
}

/** Simple text block. */
function textBlock(id: string, text: string) {
  return {
    [id]: {
      value: {
        id,
        type: 'text',
        properties: { title: [[text]] },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Empty / trivial pages
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — empty page', () => {
  it('returns a doc with one empty paragraph when no content', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const chunk = makeChunk(pageBlock(pageId, []))
    const doc = notionChunkToTiptap(pageId, chunk.recordMap.block) as any
    expect(doc.type).toBe('doc')
    expect(doc.content.length).toBeGreaterThanOrEqual(1)
    const last = doc.content[doc.content.length - 1]
    expect(last.type).toBe('paragraph')
  })

  it('returns fallback doc when pageId is not found in blocks', () => {
    const doc = notionChunkToTiptap('nonexistent', {}) as any
    expect(doc.type).toBe('doc')
    expect(doc.content[0].type).toBe('paragraph')
  })
})

// ---------------------------------------------------------------------------
// Title as H1
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — page title', () => {
  it('adds the page title as an h1 at the top', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId], 'My Page Title'),
      ...textBlock(childId, 'body text'),
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const h1 = doc.content[0]
    expect(h1.type).toBe('heading')
    expect(h1.attrs.level).toBe(1)
    expect(h1.content[0].text).toBe('My Page Title')
  })

  it('omits h1 when title is empty', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const blocks = pageBlock(pageId, [])
    const doc = notionChunkToTiptap(pageId, blocks) as any
    expect(doc.content[0].type).not.toBe('heading')
  })
})

// ---------------------------------------------------------------------------
// Text / paragraph blocks
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — paragraphs', () => {
  it('converts a text block to a paragraph', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      ...textBlock(childId, 'Hello world'),
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const para = doc.content.find((n: any) => n.type === 'paragraph')
    expect(para).toBeDefined()
    expect(para.content[0].text).toBe('Hello world')
  })

  it('renders an empty paragraph for an empty text block', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: { value: { id: childId, type: 'text', properties: {} } },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const para = doc.content.find((n: any) => n.type === 'paragraph')
    expect(para).toBeDefined()
    expect(para.content).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — headings', () => {
  const cases: Array<[string, number]> = [
    ['header', 1],
    ['sub_header', 2],
    ['sub_sub_header', 3],
  ]

  for (const [notionType, level] of cases) {
    it(`converts ${notionType} to h${level}`, () => {
      const pageId = 'aabbccddee112233aabbccdd'
      const childId = 'cc112233aabbccddee112233'
      const blocks = {
        ...pageBlock(pageId, [childId]),
        [childId]: {
          value: {
            id: childId,
            type: notionType,
            properties: { title: [[`Heading ${level}`]] },
          },
        },
      }
      const doc = notionChunkToTiptap(pageId, blocks) as any
      const heading = doc.content.find((n: any) => n.type === 'heading' && n.attrs.level === level)
      expect(heading).toBeDefined()
      expect(heading.content[0].text).toBe(`Heading ${level}`)
    })
  }
})

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — lists', () => {
  it('converts bulleted_list to bulletList', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const itemId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [itemId]),
      [itemId]: {
        value: { id: itemId, type: 'bulleted_list', properties: { title: [['Item A']] } },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const list = doc.content.find((n: any) => n.type === 'bulletList')
    expect(list).toBeDefined()
    expect(list.content[0].type).toBe('listItem')
  })

  it('converts numbered_list to orderedList', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const itemId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [itemId]),
      [itemId]: {
        value: { id: itemId, type: 'numbered_list', properties: { title: [['Step 1']] } },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const list = doc.content.find((n: any) => n.type === 'orderedList')
    expect(list).toBeDefined()
  })

  it('merges adjacent bullet list items into a single bulletList node', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const id1 = 'cc112233aabbccddee112233'
    const id2 = 'dd112233aabbccddee112234'
    const id3 = 'ee112233aabbccddee112235'
    const blocks = {
      ...pageBlock(pageId, [id1, id2, id3]),
      [id1]: { value: { id: id1, type: 'bulleted_list', properties: { title: [['A']] } } },
      [id2]: { value: { id: id2, type: 'bulleted_list', properties: { title: [['B']] } } },
      [id3]: { value: { id: id3, type: 'bulleted_list', properties: { title: [['C']] } } },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const lists = doc.content.filter((n: any) => n.type === 'bulletList')
    expect(lists.length).toBe(1)
    expect(lists[0].content.length).toBe(3)
  })

  it('does not merge bullet list with ordered list', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const id1 = 'cc112233aabbccddee112233'
    const id2 = 'dd112233aabbccddee112234'
    const blocks = {
      ...pageBlock(pageId, [id1, id2]),
      [id1]: { value: { id: id1, type: 'bulleted_list', properties: { title: [['A']] } } },
      [id2]: { value: { id: id2, type: 'numbered_list', properties: { title: [['1']] } } },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const bulletLists = doc.content.filter((n: any) => n.type === 'bulletList')
    const orderedLists = doc.content.filter((n: any) => n.type === 'orderedList')
    expect(bulletLists.length).toBe(1)
    expect(orderedLists.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — images', () => {
  it('renders IMAGE_LOADING_PLACEHOLDER when src not in imageMap', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const imgId = 'cc112233aabbccddee112233'
    const src = 'https://example.com/image.png'
    const blocks = {
      ...pageBlock(pageId, [imgId]),
      [imgId]: {
        value: {
          id: imgId,
          type: 'image',
          properties: { source: [[src]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks, {}) as any
    const img = doc.content.find((n: any) => n.type === 'image')
    expect(img).toBeDefined()
    expect(img.attrs.src).toBe(IMAGE_LOADING_PLACEHOLDER)
  })

  it('uses resolved data URL when src is in imageMap', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const imgId = 'cc112233aabbccddee112233'
    const src = 'https://example.com/image.png'
    const dataUrl = 'data:image/webp;base64,abc123'
    const blocks = {
      ...pageBlock(pageId, [imgId]),
      [imgId]: {
        value: {
          id: imgId,
          type: 'image',
          properties: { source: [[src]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks, { [src]: dataUrl }) as any
    const img = doc.content.find((n: any) => n.type === 'image')
    expect(img.attrs.src).toBe(dataUrl)
  })

  it('handles attachment: scheme URLs as keys in imageMap', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const imgId = 'cc112233aabbccddee112233'
    const src = 'attachment:e24e09ec-d468-42b6-94a6-152650961b19:image.png'
    const dataUrl = 'data:image/webp;base64,xyz'
    const blocks = {
      ...pageBlock(pageId, [imgId]),
      [imgId]: {
        value: {
          id: imgId,
          type: 'image',
          properties: { source: [[src]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks, { [src]: dataUrl }) as any
    const img = doc.content.find((n: any) => n.type === 'image')
    expect(img.attrs.src).toBe(dataUrl)
  })

  it('prefers format.display_source over properties.source', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const imgId = 'cc112233aabbccddee112233'
    const displaySrc = 'https://example.com/display.png'
    const propSrc = 'https://example.com/original.png'
    const dataUrl = 'data:image/webp;base64,display'
    const blocks = {
      ...pageBlock(pageId, [imgId]),
      [imgId]: {
        value: {
          id: imgId,
          type: 'image',
          format: { display_source: displaySrc },
          properties: { source: [[propSrc]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks, { [displaySrc]: dataUrl }) as any
    const img = doc.content.find((n: any) => n.type === 'image')
    expect(img.attrs.src).toBe(dataUrl)
  })

  it('skips image block with no src', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const imgId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [imgId]),
      [imgId]: {
        value: { id: imgId, type: 'image', properties: {} },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const img = doc.content.find((n: any) => n.type === 'image')
    expect(img).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Inline rich text (bold, italic, code, link)
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — inline marks', () => {
  it('applies bold mark', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: {
        value: {
          id: childId,
          type: 'text',
          properties: { title: [['bold text', [['b']]]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const para = doc.content.find((n: any) => n.type === 'paragraph')
    expect(para.content[0].marks).toContainEqual({ type: 'bold' })
  })

  it('applies link mark with href', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: {
        value: {
          id: childId,
          type: 'text',
          properties: { title: [['click here', [['a', 'https://example.com']]]] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const para = doc.content.find((n: any) => n.type === 'paragraph')
    expect(para.content[0].marks).toContainEqual({
      type: 'link',
      attrs: { href: 'https://example.com' },
    })
  })
})

// ---------------------------------------------------------------------------
// Other block types
// ---------------------------------------------------------------------------

describe('notionChunkToTiptap — other blocks', () => {
  it('converts code block', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: {
        value: {
          id: childId,
          type: 'code',
          properties: { title: [['const x = 1']] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const code = doc.content.find((n: any) => n.type === 'codeBlock')
    expect(code).toBeDefined()
    expect(code.content[0].text).toBe('const x = 1')
  })

  it('converts divider to horizontalRule', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: { value: { id: childId, type: 'divider' } },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const hr = doc.content.find((n: any) => n.type === 'horizontalRule')
    expect(hr).toBeDefined()
  })

  it('converts quote to blockquote', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    const childId = 'cc112233aabbccddee112233'
    const blocks = {
      ...pageBlock(pageId, [childId]),
      [childId]: {
        value: {
          id: childId,
          type: 'quote',
          properties: { title: [['A wise quote']] },
        },
      },
    }
    const doc = notionChunkToTiptap(pageId, blocks) as any
    const bq = doc.content.find((n: any) => n.type === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('prevents infinite recursion on circular block references', () => {
    const pageId = 'aabbccddee112233aabbccdd'
    // child1 references child2, child2 references child1 (cycle)
    const id1 = 'cc112233aabbccddee112233'
    const id2 = 'dd112233aabbccddee112234'
    const blocks = {
      ...pageBlock(pageId, [id1]),
      [id1]: { value: { id: id1, type: 'text', properties: { title: [['A']] }, content: [id2] } },
      [id2]: { value: { id: id2, type: 'text', properties: { title: [['B']] }, content: [id1] } },
    }
    expect(() => notionChunkToTiptap(pageId, blocks)).not.toThrow()
  })
})
