import { describe, expect, it } from 'vitest'
import { validateExternalOpenPath } from './external-file-open-path'

describe('validateExternalOpenPath', () => {
  it('normalizes every accepted absolute spelling', () => {
    const cases: [input: string, normalized: string][] = [
      ['/Users/alice/.zshrc', '/Users/alice/.zshrc'],
      ['  /Users/alice/.zshrc  ', '/Users/alice/.zshrc'],
      ['/Users/alice/./notes/../.zshrc', '/Users/alice/.zshrc'],
      ['/Users//alice///.zshrc', '/Users/alice/.zshrc'],
      ['C:\\Users\\alice\\.zshrc', 'C:/Users/alice/.zshrc'],
      ['C:\\Users\\alice\\..\\bob\\.zshrc', 'C:/Users/bob/.zshrc'],
      ['\\\\wsl.localhost\\Ubuntu\\home\\alice\\.zshrc', '//wsl.localhost/Ubuntu/home/alice/.zshrc']
    ]
    expect(cases.map(([input]) => validateExternalOpenPath(input))).toEqual(
      cases.map(([, normalized]) => normalized)
    )
  })

  it('refuses what an external target has no root to bound', () => {
    const cases: [input: string, message: string][] = [
      ['', 'Enter a file path.'],
      ['   ', 'Enter a file path.'],
      ['relative/path.ts', 'Enter an absolute file path.'],
      ['../sibling/path.ts', 'Enter an absolute file path.'],
      ['~/.zshrc', 'Enter an absolute file path.'],
      ['/Users/alice/', 'Enter a file path, not a directory path.'],
      ['C:\\Users\\alice\\', 'Enter a file path, not a directory path.'],
      ['/Users/alice/bad\u0000name.ts', 'File paths cannot contain control characters.'],
      ['/Users/alice/bad\nname.ts', 'File paths cannot contain control characters.'],
      ['/Users/alice/bad\u007fname.ts', 'File paths cannot contain control characters.']
    ]
    expect(
      cases.map(([input]) => {
        try {
          return validateExternalOpenPath(input)
        } catch (error) {
          return (error as Error).message
        }
      })
    ).toEqual(cases.map(([, message]) => message))
  })
})
