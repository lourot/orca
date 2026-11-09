import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Nodes } from 'mdast'
import { remarkJiraKeyLinks } from './remark-jira-key-links'

function links(markdown: string): string[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkJiraKeyLinks, { baseUrl: 'https://example.atlassian.net', projectKeys: ['ABC'] })
  // The plugins mutate the parsed tree in place, which keeps its mdast type.
  const tree = processor.parse(markdown)
  processor.runSync(tree)
  const found: string[] = []
  const visit = (node: Nodes): void => {
    if (node.type === 'link') {
      const label = node.children.map((child) => (child.type === 'text' ? child.value : ''))
      found.push(`${label.join('')} -> ${node.url}`)
    }
    if ('children' in node) {
      node.children.forEach(visit)
    }
  }
  visit(tree)
  return found
}

describe('remarkJiraKeyLinks', () => {
  it('links keys in prose only, leaving code, existing links and bare URLs as written', () => {
    expect(
      links(
        [
          '* [x] done ABC-282 // **ABC-426**',
          '`ABC-1` and [see ABC-2](https://other.example/x)',
          'https://example.atlassian.net/browse/ABC-3',
          '```',
          'ABC-4',
          '```'
        ].join('\n')
      )
    ).toEqual([
      'ABC-282 -> https://example.atlassian.net/browse/ABC-282',
      'ABC-426 -> https://example.atlassian.net/browse/ABC-426',
      'see ABC-2 -> https://other.example/x',
      'https://example.atlassian.net/browse/ABC-3 -> https://example.atlassian.net/browse/ABC-3'
    ])
  })
})
