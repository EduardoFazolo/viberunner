import { describe, expect, it } from 'vitest'
import { detectAgentStatusFromTerminalBuffer, detectAgentStatusFromTitle } from '../modules/servers/agentic_signals/shared/detection'

describe('detectAgentStatusFromTitle', () => {
  it('detects permission prompts from Claude title text', () => {
    expect(detectAgentStatusFromTitle('* Request user permissions')).toBe('needs_permission')
  })

  it('detects input prompts from Claude title text', () => {
    expect(detectAgentStatusFromTitle('* Get user input for coding session')).toBe('needs_input')
  })

  it('ignores unrelated titles', () => {
    expect(detectAgentStatusFromTitle('~/tools/canvaflow')).toBeNull()
  })
})

describe('detectAgentStatusFromTerminalBuffer', () => {
  it('detects Claude permission prompts that use proceed/amend footer controls', () => {
    expect(
      detectAgentStatusFromTerminalBuffer([
        'Claude requested permissions to edit /tmp/file which is a sensitive file.',
        '',
        'Do you want to proceed?',
        '> 1. Yes',
        '2. Yes, and always allow access',
        '3. No',
        '',
        'Esc to cancel · Tab to amend · ctrl+e to explain',
      ].join('\n'))
    ).toBe('needs_permission')
  })

  it('prefers input prompts over a stale earlier Claude prompt line', () => {
    expect(
      detectAgentStatusFromTerminalBuffer([
        '> ask me for input',
        '',
        'What would you like to work on?',
        '1. New feature',
        'Type something.',
        'Enter to select · ↑/↓ to navigate · Esc to cancel',
      ].join('\n'))
    ).toBe('needs_input')
  })

  it('detects updated Claude task prompt copy with "today"', () => {
    expect(
      detectAgentStatusFromTerminalBuffer([
        'Task',
        '',
        'What would you like to work on today?',
        '1. Fix a bug',
        '2. Add a feature',
      ].join('\n'))
    ).toBe('needs_input')
  })

  it('does not treat an active thinking footer as idle', () => {
    expect(
      detectAgentStatusFromTerminalBuffer([
        'Manifesting… (thinking)',
        '',
        '>',
        '',
        'esc to interrupt',
      ].join('\n'))
    ).toBeNull()
  })

  it('detects Claude returning to its ready prompt as done', () => {
    expect(
      detectAgentStatusFromTerminalBuffer([
        'Hello! What can I help you with?',
        '',
        '>',
        '',
        '? for shortcuts',
      ].join('\n'))
    ).toBe('done')
  })
})
