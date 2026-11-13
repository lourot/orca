// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import { PendingBrowserAnnotationCard } from './pending-browser-annotation-card'

afterEach(() => {
  cleanup()
})

async function renderCard(initialComment?: string) {
  const onCancel = vi.fn()
  render(
    <PendingBrowserAnnotationCard
      payload={{ ...makeAnnotation('page-1').payload, screenshot: null }}
      worktreeId="wt-1"
      resolveAnchor={() => ({ x: 0, y: 0, side: 'bottom' })}
      portalContainer={null}
      initialDraft={
        initialComment === undefined
          ? undefined
          : { comment: initialComment, intent: 'change', imagePaths: [] }
      }
      onAdd={vi.fn()}
      onCancel={onCancel}
    />
  )
  // Radix registers its outside-pointer listener on the next tick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return onCancel
}

/** A mouse press outside the card, as when clicking the sidebar or a terminal. */
function clickOutside(): void {
  act(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })
    )
    document.body.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' })
    )
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('pending browser annotation card', () => {
  it('keeps a typed draft open when the user clicks elsewhere in the window', async () => {
    const onCancel = await renderCard('Half typed')
    expect(screen.getByRole('textbox', { name: 'Annotation comment' })).toHaveProperty(
      'value',
      'Half typed'
    )
    clickOutside()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('still closes an empty draft on an outside click', async () => {
    const onCancel = await renderCard()
    clickOutside()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
