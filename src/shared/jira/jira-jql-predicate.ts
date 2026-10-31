function findOrderBy(jql: string): number {
  let quote: string | null = null
  let depth = 0
  for (let index = 0; index < jql.length; index += 1) {
    const character = jql[index]
    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
    } else if (
      depth === 0 &&
      (index === 0 || /\s/.test(jql[index - 1])) &&
      /^order\s+by\b/i.test(jql.slice(index))
    ) {
      return index
    }
  }
  return -1
}

/** The query without its ORDER BY clause, for requests where order is meaningless (counts). */
export function stripJiraJqlOrderBy(jql: string): string {
  const trimmed = jql.trim()
  const orderByIndex = findOrderBy(trimmed)
  return orderByIndex < 0 ? trimmed : trimmed.slice(0, orderByIndex).trim()
}

export function appendJiraJqlPredicate(jql: string, predicate: string): string {
  const trimmed = jql.trim()
  const orderByIndex = findOrderBy(trimmed)
  const where = orderByIndex < 0 ? trimmed : trimmed.slice(0, orderByIndex).trim()
  const orderBy = orderByIndex < 0 ? '' : trimmed.slice(orderByIndex)
  return [where ? `(${where}) AND ${predicate}` : predicate, orderBy].filter(Boolean).join(' ')
}

export function withCurrentSprintClause(jql: string): string {
  return appendJiraJqlPredicate(jql, 'sprint in openSprints()')
}
