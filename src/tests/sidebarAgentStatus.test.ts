import { describe, expect, it } from 'vitest'
import { getSidebarAgentStatusUi } from '../modules/servers/agentic_signals/renderer/sidebarStatusUi'

describe('getSidebarAgentStatusUi', () => {
  it('marks needs_input as Awaiting user input state', () => {
    expect(getSidebarAgentStatusUi('needs_input')).toEqual({
      isAgentActive: false,
      needsUserInput: true,
      isDone: false,
      isThinking: false,
    })
  })

  it('marks needs_permission as Awaiting user input state', () => {
    expect(getSidebarAgentStatusUi('needs_permission')).toEqual({
      isAgentActive: false,
      needsUserInput: true,
      isDone: false,
      isThinking: false,
    })
  })

  it('marks thinking as active so the sidebar can show it for any workspace', () => {
    expect(getSidebarAgentStatusUi('thinking')).toEqual({
      isAgentActive: true,
      needsUserInput: false,
      isDone: false,
      isThinking: true,
    })
  })

  it('marks done without treating it as active', () => {
    expect(getSidebarAgentStatusUi('done')).toEqual({
      isAgentActive: false,
      needsUserInput: false,
      isDone: true,
      isThinking: false,
    })
  })

  it('treats idle as inactive', () => {
    expect(getSidebarAgentStatusUi('idle')).toEqual({
      isAgentActive: false,
      needsUserInput: false,
      isDone: false,
      isThinking: false,
    })
  })
})
