// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { WorktreeColorTagMenuItems } from './WorktreeColorTagMenuItems'

afterEach(cleanup)

function renderBadges(colorTagUsage: ReadonlyMap<string, number>): Record<string, string> {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <WorktreeColorTagMenuItems
          colorTag="#ef4444"
          mixed={false}
          disabled={false}
          isMultiContext={false}
          colorTagUsage={colorTagUsage}
          onAssignColorTag={vi.fn()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const badges: Record<string, string> = {}
  for (const badge of document.querySelectorAll('[data-workspace-color-usage]')) {
    const swatch = badge.closest('[data-workspace-color-swatch]')
    badges[swatch?.getAttribute('data-workspace-color-swatch') ?? '?'] = badge.textContent ?? ''
  }
  return badges
}

describe('WorktreeColorTagMenuItems', () => {
  it('badges only the swatches workspaces use, the current color included, capping at 9+', () => {
    expect(
      renderBadges(
        new Map([
          ['#ef4444', 1],
          ['#22c55e', 3],
          ['#8b5cf6', 12]
        ])
      )
    ).toEqual({ '#ef4444': '1', '#22c55e': '3', '#8b5cf6': '9+' })
  })

  it('names the usage in the swatch label so screen readers hear it', () => {
    renderBadges(new Map([['#22c55e', 2]]))
    expect(
      document.querySelector('[data-workspace-color-swatch="#22c55e"]')?.getAttribute('aria-label')
    ).toBe('Use color #22c55e, used by 2 workspaces')
    expect(
      document.querySelector('[data-workspace-color-swatch="#f97316"]')?.getAttribute('aria-label')
    ).toBe('Use color #f97316')
  })
})
