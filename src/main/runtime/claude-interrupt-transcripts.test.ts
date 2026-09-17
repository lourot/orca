/**
 * Pins Claude's interrupt marker to captured transcripts instead of a remembered screen.
 *
 * Nothing here asserts what Claude prints — the transcripts do. Each is replayed through the
 * runtime, because escape handling, wrapping and the emulator projection all live there and a
 * rule tested on pre-rendered text is tested on something no pane ever sees.
 *
 * Capture protocol: docs/reference/agent-pty-transcript-capture.md
 * What each transcript decides: docs/reference/claude-interrupt-screen-evidence.md
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createTranscriptPane } from './agent-transcript-pane-test-harness'
import { countClaudeInterruptMarkers } from './claude-interrupt-screen'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const FIXTURE_DIR = join(__dirname, '__fixtures__')
const EVIDENCE_DOC = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'reference',
  'claude-interrupt-screen-evidence.md'
)
// String.fromCharCode, not a literal: the formatter rewrites an escape sequence into a raw
// control byte in source, which is unreadable and survives badly in diffs.
const ESC = String.fromCharCode(27)

type TranscriptCase = {
  /** Fixture basename; `<name>.txt` and `<name>.meta.json` under `__fixtures__/`. */
  name: string
  what: string
  expectMarker: boolean
}

const TRANSCRIPTS: readonly TranscriptCase[] = [
  {
    name: 'claude-interrupt-during-tool',
    what: 'escape while a Bash tool call is running',
    expectMarker: true
  },
  {
    name: 'claude-interrupt-during-text',
    what: 'escape while prose streams, no tool in flight',
    expectMarker: true
  },
  {
    name: 'claude-interrupt-at-permission',
    what: 'escape while a permission prompt owns the screen',
    expectMarker: true
  },
  {
    name: 'claude-btw-composer-dismissed',
    what: 'escape closing the slash-command menu mid-turn — the turn keeps running (#13547)',
    expectMarker: false
  },
  {
    name: 'claude-turn-completed-normally',
    what: 'a turn that ended on its own, never interrupted',
    expectMarker: false
  }
]

/** The PTY size the capture ran at; replaying at another width rewraps the screen into text no
 *  terminal ever showed, so a missing or malformed sidecar has to fail rather than default. */
function capturePtySize(name: string): { cols: number; rows: number } {
  const meta: unknown = JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.meta.json`), 'utf8'))
  if (typeof meta !== 'object' || meta === null || !('cols' in meta) || !('rows' in meta)) {
    throw new Error(`${name}.meta.json records no PTY size`)
  }
  const { cols, rows } = meta
  if (typeof cols !== 'number' || typeof rows !== 'number') {
    throw new Error(`${name}.meta.json PTY size is not numeric`)
  }
  return { cols, rows }
}

/** The pane screen as the hook server reads it: the emulator grid, not the output stream. */
async function readPaneScreen(name: string): Promise<readonly string[]> {
  const { runtime, handle } = await createTranscriptPane({
    paneTitle: 'claude',
    foregroundProcess: 'claude',
    data: readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf8'),
    size: capturePtySize(name)
  })
  const read = await runtime.readTerminal(handle, { screen: true })
  expect(read.source).toBe('screen')
  return read.tail
}

describe('Claude interrupt marker, decided by captured transcripts', () => {
  for (const transcript of TRANSCRIPTS) {
    it(`${transcript.what} → ${transcript.expectMarker ? 'marker' : 'no marker'}`, async () => {
      const markers = countClaudeInterruptMarkers(await readPaneScreen(transcript.name))
      expect(markers > 0).toBe(transcript.expectMarker)
    })

    it(`${transcript.name} was captured raw, not pasted from a rendered screen`, () => {
      const text = readFileSync(join(FIXTURE_DIR, `${transcript.name}.txt`), 'utf8')
      // A transcript with no escapes or carriage returns went through a terminal's renderer and
      // someone's clipboard. It cannot answer what the repaints looked like.
      expect(text).toContain(ESC)
      expect(text).toContain('\r')
    })
  }

  it('the turn still running is the case the rule must refuse, so pin that it is', async () => {
    // Why assert the positive too: a fixture that stopped reproducing the #13547 shape would
    // otherwise keep passing the marker assertion above for the wrong reason.
    expect((await readPaneScreen('claude-btw-composer-dismissed')).join('\n')).toContain('Running…')
  })

  it('documents every transcript the rule is allowed to depend on', () => {
    const doc = readFileSync(EVIDENCE_DOC, 'utf8')
    for (const transcript of TRANSCRIPTS) {
      expect(doc).toContain(`${transcript.name}.txt`)
    }
  })
})
