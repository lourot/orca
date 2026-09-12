import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'

type CapturedButtonProps = {
  disabled?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

const mocks = vi.hoisted(() => ({
  buttons: [] as CapturedButtonProps[],
  copyAgentSessionForkContext: vi.fn(),
  startAgentSessionFork: vi.fn()
}))

vi.mock('@/components/ui/button', async () => {
  const ReactModule = await import('react')
  return {
    Button: (props: CapturedButtonProps) => {
      mocks.buttons.push(props)
      return ReactModule.createElement('button', { disabled: props.disabled }, props.children)
    }
  }
})

vi.mock('@/components/ui/dialog', async () => {
  const ReactModule = await import('react')
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? ReactModule.createElement('div', null, children) : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('div', null, children),
    DialogDescription: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('p', null, children),
    DialogFooter: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('footer', null, children),
    DialogHeader: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('header', null, children),
    DialogTitle: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('h2', null, children)
  }
})

vi.mock('./terminal-agent-session-fork', () => ({
  startAgentSessionFork: mocks.startAgentSessionFork
}))

vi.mock('./terminal-agent-session-fork-clipboard', () => ({
  copyAgentSessionForkContext: mocks.copyAgentSessionForkContext
}))

const SESSION_ID = 'c0ffee00-1111-4222-8333-444455556666'

/** The selected radio card's markup, up to the end of its <button> element. */
function checkedCardTag(html: string): string {
  const start = html.lastIndexOf('<button', html.indexOf('aria-checked="true"'))
  return html.slice(start, html.indexOf('</button>', start))
}

function makeFork(overrides: Partial<PreparedAgentSessionFork> = {}): PreparedAgentSessionFork {
  return {
    prompt: 'fork prompt',
    agent: 'claude',
    worktreeId: 'wt-1',
    pane: {} as PreparedAgentSessionFork['pane'],
    providerSession: { key: 'session_id', id: SESSION_ID },
    mode: 'recent-context',
    ...overrides
  }
}

describe('TerminalAgentSessionForkDialog', () => {
  beforeEach(() => {
    mocks.buttons = []
    mocks.copyAgentSessionForkContext.mockReset()
    mocks.startAgentSessionFork.mockReset()
  })

  it('prevents busy-state double submit for create', async () => {
    mocks.startAgentSessionFork.mockReturnValue(new Promise(() => undefined))
    const { TerminalAgentSessionForkDialog } = await import('./TerminalAgentSessionForkDialog')

    renderToStaticMarkup(
      <TerminalAgentSessionForkDialog open fork={makeFork()} onOpenChange={vi.fn()} />
    )

    const createButton = mocks.buttons[1]
    expect(createButton).toBeDefined()

    createButton?.onClick?.()
    createButton?.onClick?.()

    expect(mocks.startAgentSessionFork).toHaveBeenCalledTimes(1)
  })

  it('defaults to forking the full conversation when the pane has a Claude session', async () => {
    mocks.startAgentSessionFork.mockResolvedValue(true)
    const { TerminalAgentSessionForkDialog } = await import('./TerminalAgentSessionForkDialog')

    const html = renderToStaticMarkup(
      <TerminalAgentSessionForkDialog open fork={makeFork()} onOpenChange={vi.fn()} />
    )

    expect(html).toContain('role="radiogroup"')
    expect(checkedCardTag(html)).toContain('Full conversation')
    expect(checkedCardTag(html)).not.toContain('disabled')

    mocks.buttons[1]?.onClick?.()
    await Promise.resolve()

    expect(mocks.startAgentSessionFork).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'full-conversation' })
    )
  })

  it.each([
    [
      'a non-Claude agent',
      { agent: 'codex' as const },
      'Only Claude sessions can be forked with their full conversation.'
    ],
    [
      'a pane with no session id',
      { providerSession: null },
      'No session id captured for this pane yet.'
    ]
  ])(
    'disables the full-conversation card for %s and says why',
    async (_label, overrides, reason) => {
      mocks.startAgentSessionFork.mockResolvedValue(true)
      const { TerminalAgentSessionForkDialog } = await import('./TerminalAgentSessionForkDialog')

      const html = renderToStaticMarkup(
        <TerminalAgentSessionForkDialog open fork={makeFork(overrides)} onOpenChange={vi.fn()} />
      )

      expect(html).toContain(reason)
      // Why not `disabled`: the card must stay in the tab order so a screen
      // reader reaches the reason instead of skipping the card entirely.
      expect(html).toContain('aria-disabled="true"')
      expect(html).not.toContain('disabled=""')

      mocks.buttons[1]?.onClick?.()
      await Promise.resolve()

      expect(mocks.startAgentSessionFork).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'recent-context' })
      )
    }
  )
})
