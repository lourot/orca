import {
  findJiraKeyTextLinks,
  type JiraKeyLinkConfig
} from '../../../../shared/jira/jira-key-text-links'

type MarkdownNode = {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}

// Text under these already links somewhere or is literal.
const OPAQUE_PARENTS = new Set(['link', 'linkReference', 'image', 'imageReference', 'definition'])

function splitText(value: string, config: JiraKeyLinkConfig): MarkdownNode[] {
  const links = findJiraKeyTextLinks(value, config)
  if (links.length === 0) {
    return [{ type: 'text', value }]
  }
  const parts: MarkdownNode[] = []
  let cursor = 0
  for (const link of links) {
    if (link.start > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, link.start) })
    }
    parts.push({ type: 'link', url: link.url, children: [{ type: 'text', value: link.key }] })
    cursor = link.end
  }
  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) })
  }
  return parts
}

function transformChildren(node: MarkdownNode, config: JiraKeyLinkConfig): void {
  if (!node.children || OPAQUE_PARENTS.has(node.type)) {
    return
  }
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value !== undefined) {
      return splitText(child.value, config)
    }
    transformChildren(child, config)
    return [child]
  })
}

/** Turns configured Jira issue keys in prose into links; code, HTML and existing links are untouched. */
export function remarkJiraKeyLinks(config: JiraKeyLinkConfig | null): (tree: MarkdownNode) => void {
  return (tree) => {
    if (config) {
      transformChildren(tree, config)
    }
  }
}
