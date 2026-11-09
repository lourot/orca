export type JiraKeyLinkConfig = {
  baseUrl: string
  projectKeys: readonly string[]
}

/** Jira site and project keys whose issue keys become links in Markdown views. */
export type JiraKeyLinkSettings = {
  jiraKeyLinks?: JiraKeyLinkConfig
}

export type JiraKeyTextLink = {
  start: number
  end: number
  key: string
  url: string
}

const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/

type CompiledJiraKeyLinks = { baseUrl: string; pattern: RegExp }

// Callers scan line by line with the same settings object, so compile once per object.
const compiledByConfig = new WeakMap<JiraKeyLinkConfig, CompiledJiraKeyLinks | null>()

/** Normalises user-entered project keys: uppercase, valid Jira project-key syntax, deduplicated. */
export function normalizeJiraProjectKeys(keys: readonly string[]): string[] {
  const normalized = keys.map((key) => key.trim().toUpperCase())
  return [...new Set(normalized.filter((key) => PROJECT_KEY_PATTERN.test(key)))]
}

/** Returns the base URL without trailing slashes, or null unless it is a plain http(s) URL. */
export function normalizeJiraKeyLinkBaseUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function compile(config: JiraKeyLinkConfig): CompiledJiraKeyLinks | null {
  if (compiledByConfig.has(config)) {
    return compiledByConfig.get(config) ?? null
  }
  const baseUrl = normalizeJiraKeyLinkBaseUrl(config.baseUrl)
  const projectKeys = normalizeJiraProjectKeys(config.projectKeys)
  // Longest first so an alternation like LD|LDT cannot stop at the shorter key.
  const alternatives = projectKeys.sort((a, b) => b.length - a.length).join('|')
  const compiled =
    baseUrl && alternatives
      ? {
          baseUrl,
          pattern: new RegExp(
            `(?<![A-Za-z0-9_\\-/.#=@])(?:${alternatives})-\\d+(?![A-Za-z0-9_])`,
            'g'
          )
        }
      : null
  compiledByConfig.set(config, compiled)
  return compiled
}

/** Whether the whitespace-delimited token around [start, end) is a URL, so a key in it is already addressed. */
function isInsideUrlToken(text: string, start: number, end: number): boolean {
  let tokenStart = start
  while (tokenStart > 0 && !/\s/.test(text[tokenStart - 1])) {
    tokenStart -= 1
  }
  let tokenEnd = end
  while (tokenEnd < text.length && !/\s/.test(text[tokenEnd])) {
    tokenEnd += 1
  }
  const token = text.slice(tokenStart, tokenEnd)
  return token.includes('://') || /(^|[^A-Za-z0-9])www\./i.test(token)
}

/** Finds configured Jira issue keys in plain text, skipping any inside a URL. */
export function findJiraKeyTextLinks(
  text: string,
  config: JiraKeyLinkConfig | null
): JiraKeyTextLink[] {
  const compiled = config ? compile(config) : null
  if (!compiled) {
    return []
  }
  const links: JiraKeyTextLink[] = []
  for (const match of text.matchAll(compiled.pattern)) {
    const start = match.index
    const end = start + match[0].length
    if (isInsideUrlToken(text, start, end)) {
      continue
    }
    links.push({ start, end, key: match[0], url: `${compiled.baseUrl}/browse/${match[0]}` })
  }
  return links
}
