// @vitest-environment happy-dom

import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchResultsPane } from './SearchResultsPane'

const RESULTS = { files: [], totalMatches: 0, truncated: false }

function renderPane(props: { stale: boolean; hasCommittedResults: boolean; error?: string }) {
  const onRefresh = vi.fn()
  render(
    <SearchResultsPane
      results={props.hasCommittedResults ? RESULTS : null}
      hasCommittedResults={props.hasCommittedResults}
      error={props.error ?? null}
      query="needle"
      loading={false}
      rows={[]}
      scrollRef={createRef<HTMLDivElement>()}
      stale={props.stale}
      onRefresh={onRefresh}
      onToggleCollapsedFile={vi.fn()}
      onMatchClick={vi.fn()}
    />
  )
  return onRefresh
}

describe('SearchResultsPane', () => {
  afterEach(cleanup)

  it.each([
    {
      name: 'stale committed results, even with 0 matches',
      stale: true,
      hasCommittedResults: true,
      shown: true
    },
    { name: 'fresh results', stale: false, hasCommittedResults: true, shown: false },
    { name: 'no committed results', stale: true, hasCommittedResults: false, shown: false },
    { name: 'a search error', stale: true, hasCommittedResults: true, error: 'boom', shown: false }
  ])('outdated bar for $name: shown = $shown', ({ shown, ...props }) => {
    renderPane(props)

    expect(screen.queryByRole('button', { name: 'Refresh' }) !== null).toBe(shown)
  })

  it('Refresh in the outdated bar calls onRefresh', () => {
    const onRefresh = renderPane({ stale: true, hasCommittedResults: true })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
