import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Why: the excerpt is captured at creation because the batch send path has no file
// content to derive one from later. A creation site that forgets it produces a note
// that reaches the agent as a bare line number - useless in a generated or very
// large file, and invisible until someone reads a prompt. There are five surfaces
// that create notes, so guard the tree rather than each call site.
const SCANNED_ROOT = 'src/renderer'
const SCANNED_EXTENSIONS = ['.ts', '.tsx']
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'out', 'build', '.git'])
const CALL = 'addDiffComment({'
// Every creation site ends its payload with the reserved side literal.
const PAYLOAD_END = "side: 'modified'"

function collectSourceFiles(root: string): string[] {
  let found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith('.')) {
      continue
    }
    const path = join(root, entry)
    if (statSync(path).isDirectory()) {
      found = found.concat(collectSourceFiles(path))
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(path)
    }
  }
  return found
}

function callSitesMissingExcerpt(text: string): number {
  let missing = 0
  let index = text.indexOf(CALL)
  while (index !== -1) {
    const end = text.indexOf(PAYLOAD_END, index)
    if (end !== -1 && !text.slice(index, end).includes('anchorExcerpt')) {
      missing += 1
    }
    index = text.indexOf(CALL, index + CALL.length)
  }
  return missing
}

describe('review note anchor excerpt coverage', () => {
  it('captures an excerpt at every note creation site', () => {
    const root = resolve(process.cwd(), SCANNED_ROOT)
    const offenders = collectSourceFiles(root).filter((file) => {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        return false
      }
      return callSitesMissingExcerpt(readFileSync(file, 'utf8')) > 0
    })

    expect(offenders.map((file) => relative(root, file))).toEqual([])
  })

  it('detects a call site that omits the excerpt', () => {
    const withExcerpt = `addDiffComment({ lineNumber: 1, anchorExcerpt: x, side: 'modified' })`
    const withoutExcerpt = `addDiffComment({ lineNumber: 1, side: 'modified' })`
    expect(callSitesMissingExcerpt(withExcerpt)).toBe(0)
    expect(callSitesMissingExcerpt(withoutExcerpt)).toBe(1)
    expect(callSitesMissingExcerpt(`${withExcerpt}\n${withoutExcerpt}`)).toBe(1)
  })
})
