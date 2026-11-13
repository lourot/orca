import { afterEach, describe, expect, it } from 'vitest'
import { buildGuestOverlayScript } from './grab-guest-script'

const guestAborts: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(guestAborts.splice(0).map((abort) => abort()))
})

/** Arms the real guest script on a page holding a paragraph and an unrelated button. */
async function armGuestWithText() {
  const { Window } = await import('happy-dom')
  const window = new Window()
  guestAborts.push(() => window.happyDOM.abort())
  const document = window.document
  document.body.innerHTML =
    '<p id="para">Hello <b>big</b> world</p><button id="other">Save</button>'
  window.eval(buildGuestOverlayScript('arm'))
  const grab: {
    host: { dispatchEvent: (event: unknown) => void }
    extractPayload: (el: unknown) => { target: { selectedText: string | null } }
    freezeHighlight: (selectionId: string) => void
    readSelectedText: () => string | null
  } = Object.getOwnPropertyDescriptor(window, '__orcaGrab')?.value
  const paragraph = document.getElementById('para')
  const bold = paragraph?.querySelector('b')?.firstChild
  const tail = bold?.parentNode?.nextSibling
  if (!paragraph || !bold || !tail) {
    throw new Error('fixture page did not render')
  }
  const range = document.createRange()
  range.setStart(bold, 0)
  range.setEnd(tail, tail.textContent?.length ?? 0)
  window.getSelection()?.addRange(range)
  /** Hovers and clicks `el` the way the overlay does, leaving its note open. */
  const pick = async (el: ReturnType<typeof document.elementFromPoint>): Promise<void> => {
    document.elementFromPoint = () => el
    grab.host.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 10, clientY: 10 }))
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    grab.freezeHighlight('selection-1')
  }
  return { window, document, grab, paragraph, pick }
}

describe('grab guest selected text', () => {
  it('records the selection when it lies inside the picked element', async () => {
    const { grab, paragraph } = await armGuestWithText()

    expect(grab.extractPayload(paragraph).target.selectedText).toBe('big world')
  })

  it('ignores a selection elsewhere on the page', async () => {
    const { grab, document } = await armGuestWithText()

    expect(grab.extractPayload(document.getElementById('other')).target.selectedText).toBeNull()
  })

  it('keeps the page selection when the overlay is pressed', async () => {
    const { grab, window } = await armGuestWithText()
    const press = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })

    grab.host.dispatchEvent(press)

    expect(press.defaultPrevented).toBe(true)
  })

  it('reads the selection inside the picked element while its note is open', async () => {
    const { grab, paragraph, pick } = await armGuestWithText()

    await pick(paragraph)

    expect(grab.readSelectedText()).toBe('big world')
  })

  it('reads no selection when it lies outside the picked element', async () => {
    const { grab, document, pick } = await armGuestWithText()

    await pick(document.getElementById('other'))

    expect(grab.readSelectedText()).toBeNull()
  })
})
