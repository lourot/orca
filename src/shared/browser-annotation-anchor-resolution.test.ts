// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildResolveBrowserAnnotationAnchorsScript,
  isValidBrowserAnnotationAnchorRequests,
  parseResolvedBrowserAnnotationAnchors,
  type BrowserAnnotationAnchorRequest
} from './browser-annotation-anchor-resolution'

const rect = { x: 1, y: 2, width: 3, height: 4 }

function runInGuest(anchors: BrowserAnnotationAnchorRequest[]): unknown {
  return new Function(`return ${buildResolveBrowserAnnotationAnchorsScript(anchors)}`)()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('finding saved notes again by selector', () => {
  it('anchors only a selector that names exactly one element', () => {
    document.body.innerHTML = '<button id="save">Save</button><p>a</p><p>b</p>'
    const anchors = [
      { id: 'found', selector: '#save' },
      { id: 'missing', selector: '#gone' },
      { id: 'ambiguous', selector: 'p' },
      { id: 'invalid', selector: 'button[' },
      { id: 'breakout', selector: "'];throw new Error('escaped');//" }
    ]

    const resolved = parseResolvedBrowserAnnotationAnchors(runInGuest(anchors), anchors)

    expect(resolved.map((anchor) => anchor.id)).toEqual(['found'])
  })

  it('accepts from the guest only numeric geometry for ids that were asked for', () => {
    const requested = [{ id: 'a', selector: 'a' }]
    const raw = [
      { id: 'a', isFixed: false, rectPage: rect, rectViewport: { ...rect, width: Number.NaN } },
      { id: 'b', isFixed: false, rectPage: rect, rectViewport: rect },
      { id: 'a', isFixed: 'yes', rectPage: rect, rectViewport: rect },
      { id: 'a', isFixed: true, rectPage: { ...rect, extra: '<img>' }, rectViewport: rect }
    ]

    expect(parseResolvedBrowserAnnotationAnchors(raw, requested)).toEqual([
      { id: 'a', isFixed: true, rectPage: rect, rectViewport: rect }
    ])
    expect(parseResolvedBrowserAnnotationAnchors('not an array', requested)).toEqual([])
  })

  it('refuses oversized or malformed requests at the IPC boundary', () => {
    expect(isValidBrowserAnnotationAnchorRequests([{ id: 'a', selector: 'b' }])).toBe(true)
    expect(isValidBrowserAnnotationAnchorRequests([{ id: 'a', selector: 'x'.repeat(701) }])).toBe(
      false
    )
    expect(isValidBrowserAnnotationAnchorRequests([{ id: '', selector: 'b' }])).toBe(false)
    expect(
      isValidBrowserAnnotationAnchorRequests(
        Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, selector: 'b' }))
      )
    ).toBe(false)
  })
})
