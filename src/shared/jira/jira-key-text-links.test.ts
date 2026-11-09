import { describe, expect, it } from 'vitest'
import { findJiraKeyTextLinks, type JiraKeyLinkConfig } from './jira-key-text-links'

const config: JiraKeyLinkConfig = {
  baseUrl: 'https://example.atlassian.net',
  projectKeys: ['ABC', 'xy', 'QA']
}

function linkedKeys(text: string, overrides: Partial<JiraKeyLinkConfig> = {}): string[] {
  return findJiraKeyTextLinks(text, { ...config, ...overrides }).map((link) =>
    text.slice(link.start, link.end)
  )
}

describe('findJiraKeyTextLinks', () => {
  it.each([
    ['plain key in prose', 'see ABC-309 today', ['ABC-309']],
    [
      'several configured projects, lowercase config key',
      'ABC-1, XY-22 and QA-3',
      ['ABC-1', 'XY-22', 'QA-3']
    ],
    ['bracketed key with trailing punctuation', '(ABC-1). [XY-2]', ['ABC-1', 'XY-2']],
    ['unconfigured project', 'RFC-001 ADR-12 SHA-256', []],
    ['lowercase key in text', 'abc-309', []],
    ['key as a longer project prefix', 'XLDT-1 LDTX-1', []],
    ['key glued to a word or number', 'ABC-1a ABC-1_b', []],
    ['key after a path separator', 'foo/ABC-1 a.ABC-2 x-ABC-3', []],
    ['last segment of a URL', 'https://example.atlassian.net/browse/ABC-309', []],
    ['query value of a URL', 'https://example.atlassian.net/jira?selectedIssue=ABC-1', []],
    ['URL wrapped in markdown link syntax', '[x](https://example.atlassian.net/browse/ABC-1)', []],
    ['www URL without scheme', 'www.example.com/ABC-1', []],
    ['key after punctuation inside a URL', 'https://example.com/issues:ABC-1,(ABC-2)', []],
    ['key after a colon in prose', 'Jira:ABC-1', ['ABC-1']],
    ['key next to a URL on the same line', 'ABC-1 https://example.com/ABC-2', ['ABC-1']]
  ])('%s', (_name, text, expected) => {
    expect(linkedKeys(text)).toEqual(expected)
  })

  it.each([
    ['empty base URL', { baseUrl: '' }],
    ['non-http base URL', { baseUrl: 'javascript:alert(1)' }],
    ['base URL with credentials', { baseUrl: 'https://user:pw@example.atlassian.net' }],
    ['no project keys', { projectKeys: [] }],
    ['only invalid project keys', { projectKeys: ['1AB', 'A B', ''] }]
  ])('links nothing with %s', (_name, overrides) => {
    expect(linkedKeys('ABC-1', overrides)).toEqual([])
  })

  it('builds the browse URL from a base URL with a path and trailing slash', () => {
    expect(
      findJiraKeyTextLinks('ABC-7', { ...config, baseUrl: 'https://jira.example.com/jira/' })
    ).toEqual([
      { start: 0, end: 5, key: 'ABC-7', url: 'https://jira.example.com/jira/browse/ABC-7' }
    ])
  })
})
