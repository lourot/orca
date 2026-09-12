import { describe, expect, it } from 'vitest'
import { buildRows } from './worktree-list/grouping/build-rows'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

describe('buildRows project grouping order', () => {
  // Distinct paths: labels are keyed by host::path, so repos sharing the shared fixture's
  // /tmp/orca would alias onto one label and every label tiebreak below would tie.
  const repoA: Repo = { ...repo, id: 'repo-a', path: '/x/alpha', displayName: 'alpha' }
  const repoB: Repo = { ...repo, id: 'repo-b', path: '/x/beta', displayName: 'beta' }
  const repoC: Repo = { ...repo, id: 'repo-c', path: '/x/gamma', displayName: 'gamma' }
  const map = new Map([
    [repoA.id, repoA],
    [repoB.id, repoB],
    [repoC.id, repoC]
  ])
  // Activity: C (300) is freshest, then A (200), then B (100). wAStale (50) is
  // an older sibling of A so a repo's rank is its max child, not its first.
  const wA: Worktree = {
    ...worktree,
    id: 'wt-a',
    repoId: repoA.id,
    displayName: 'a',
    lastActivityAt: 200
  }
  const wAStale: Worktree = {
    ...worktree,
    id: 'wt-a-stale',
    repoId: repoA.id,
    displayName: 'a2',
    lastActivityAt: 50
  }
  const wB: Worktree = {
    ...worktree,
    id: 'wt-b',
    repoId: repoB.id,
    displayName: 'b',
    lastActivityAt: 100
  }
  const wC: Worktree = {
    ...worktree,
    id: 'wt-c',
    repoId: repoC.id,
    displayName: 'c',
    lastActivityAt: 300
  }

  it('orders repo headers by explicit repoOrder, not first-encounter', () => {
    // Worktree stream encounters in order C, A, B — but repoOrder says B, A, C.
    const repoOrder = new Map([
      [repoB.id, 0],
      [repoA.id, 1],
      [repoC.id, 2]
    ])
    const rows = buildRows('repo', [wC, wA, wB], map, null, new Set(), repoOrder)
    const headerKeys = rows.filter((r) => r.type === 'header').map((r) => r.key)
    expect(headerKeys).toEqual(['repo:repo-b', 'repo:repo-a', 'repo:repo-c'])
  })

  it('places unknown repo ids last and sorts them by label', () => {
    // Only repoB is in repoOrder; repoA and repoC fall through to label sort.
    const repoOrder = new Map([[repoB.id, 0]])
    const rows = buildRows('repo', [wC, wA, wB], map, null, new Set(), repoOrder)
    const headerKeys = rows.filter((r) => r.type === 'header').map((r) => r.key)
    expect(headerKeys).toEqual(['repo:repo-b', 'repo:repo-a', 'repo:repo-c'])
  })

  it('orders repo headers by max(lastActivityAt) per repo in Recent mode', () => {
    // repoOrder pins B, A, C, but Recent ignores it: C (300) > A (200) > B (100).
    // The incoming array is name-sorted (not pre-sorted by recency), proving the
    // resolver computes the timestamp itself rather than trusting encounter order.
    const repoOrder = new Map([
      [repoB.id, 0],
      [repoA.id, 1],
      [repoC.id, 2]
    ])
    const rows = buildRows(
      'repo',
      [wA, wB, wC],
      map,
      null,
      new Set(),
      repoOrder,
      undefined,
      'recent'
    )
    const headerKeys = rows.filter((r) => r.type === 'header').map((r) => r.key)
    expect(headerKeys).toEqual(['repo:repo-c', 'repo:repo-a', 'repo:repo-b'])
  })

  it("uses each repo's freshest visible child, not its first, in Recent mode", () => {
    // repo-a has a fresh child (200) and a stale one (50); its rank is the max.
    const rows = buildRows(
      'repo',
      [wAStale, wA, wB, wC],
      map,
      null,
      new Set(),
      undefined,
      undefined,
      'recent'
    )

    expect(rows).toMatchObject([
      { type: 'header', key: 'repo:repo-c' },
      { type: 'item', worktree: { id: 'wt-c' } },
      { type: 'header', key: 'repo:repo-a' },
      // Child rows keep their input order; only the header rank uses max activity.
      { type: 'item', worktree: { id: 'wt-a-stale' } },
      { type: 'item', worktree: { id: 'wt-a' } },
      { type: 'header', key: 'repo:repo-b' },
      { type: 'item', worktree: { id: 'wt-b' } }
    ])
  })

  it('keeps the main workspace first inside its project group in Recent mode', () => {
    const main = {
      ...wA,
      id: 'wt-a-main',
      displayName: 'main',
      isMainWorktree: true,
      lastActivityAt: 10
    }
    const freshChild = {
      ...wA,
      id: 'wt-a-fresh-child',
      displayName: 'fresh-child',
      isMainWorktree: false,
      lastActivityAt: 500
    }
    const rows = buildRows(
      'repo',
      [freshChild, wB, main],
      map,
      null,
      new Set(),
      undefined,
      undefined,
      'recent'
    )

    expect(rows).toMatchObject([
      { type: 'header', key: 'repo:repo-a' },
      { type: 'item', worktree: { id: 'wt-a-main' } },
      { type: 'item', worktree: { id: 'wt-a-fresh-child' } },
      { type: 'header', key: 'repo:repo-b' },
      { type: 'item', worktree: { id: 'wt-b' } }
    ])
  })

  it('orders repo headers by repoOrder in Manual mode (default), ignoring activity', () => {
    const repoOrder = new Map([
      [repoB.id, 0],
      [repoA.id, 1],
      [repoC.id, 2]
    ])
    const rows = buildRows('repo', [wC, wA, wB], map, null, new Set(), repoOrder)
    const headerKeys = rows.filter((r) => r.type === 'header').map((r) => r.key)
    expect(headerKeys).toEqual(['repo:repo-b', 'repo:repo-a', 'repo:repo-c'])
  })

  it('builds rows for a very large repo-group list', () => {
    const count = 130_000
    const repos = new Map<string, Repo>()
    const worktrees = Array.from({ length: count }, (_, index) => {
      const repoId = `repo-${index}`
      repos.set(repoId, { ...repo, id: repoId, displayName: `repo ${index}` })
      return { ...worktree, id: `wt-${index}`, repoId, displayName: `workspace ${index}` }
    })

    const rows = buildRows('repo', worktrees, repos, null, new Set())

    expect(rows).toHaveLength(count * 2)
    expect(rows[0]).toMatchObject({ type: 'header', key: 'repo:repo-0' })
    expect(rows.at(-1)).toMatchObject({ type: 'item', worktree: { id: 'wt-129999' } })
  })
})

describe('buildRows Recent project order fallbacks', () => {
  const active: Repo = { ...repo, id: 'repo-active', displayName: 'active', addedAt: 0 }
  // Empty project has no visible worktrees, so Recent falls back to addedAt.
  const empty: Repo = { ...repo, id: 'repo-empty', displayName: 'empty', addedAt: 999 }
  const map = new Map([
    [active.id, active],
    [empty.id, empty]
  ])
  const activeWorktree: Worktree = {
    ...worktree,
    id: 'wt-active',
    repoId: active.id,
    displayName: 'active',
    lastActivityAt: 100
  }

  it('sorts placeholder projects after projects with activity', () => {
    // empty.addedAt (999) is numerically higher than active's worktree (100),
    // but a real activity timestamp must always outrank an addedAt fallback.
    const rows = buildRows(
      'repo',
      [activeWorktree],
      map,
      null,
      new Set(),
      undefined,
      undefined,
      'recent',
      {},
      undefined,
      false,
      undefined,
      [],
      new Set([empty.id])
    )
    const headerKeys = rows.filter((r) => r.type === 'header').map((r) => r.key)
    expect(headerKeys).toEqual(['repo:repo-active', 'repo:repo-empty'])
  })
})

describe('project groups', () => {
  it('orders repos inside a Project Group by projectGroupOrder in manual mode', () => {
    const group: ProjectGroup = {
      id: 'group-1',
      name: 'Platform',
      parentPath: '/platform',
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const repoA: Repo = {
      ...repo,
      id: 'repo-a',
      displayName: 'alpha',
      projectGroupId: group.id,
      projectGroupOrder: 1
    }
    const repoB: Repo = {
      ...repo,
      id: 'repo-b',
      displayName: 'beta',
      projectGroupId: group.id,
      projectGroupOrder: 0
    }
    const worktreeA: Worktree = { ...worktree, id: 'wt-a', repoId: repoA.id }
    const worktreeB: Worktree = { ...worktree, id: 'wt-b', repoId: repoB.id }
    const groupedMap = new Map([
      [repoA.id, repoA],
      [repoB.id, repoB]
    ])
    const repoOrder = new Map([
      [repoA.id, 0],
      [repoB.id, 1]
    ])

    const rows = buildRows(
      'repo',
      [worktreeA, worktreeB],
      groupedMap,
      null,
      new Set(),
      repoOrder,
      undefined,
      'manual',
      undefined,
      undefined,
      false,
      undefined,
      [group]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-1',
      'repo:repo-b',
      'repo:repo-a'
    ])
  })

  it('falls back to repoOrder for grouped repos missing projectGroupOrder in manual mode', () => {
    const group: ProjectGroup = {
      id: 'group-1',
      name: 'Platform',
      parentPath: '/platform',
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const repoA: Repo = { ...repo, id: 'repo-a', displayName: 'alpha', projectGroupId: group.id }
    const repoB: Repo = { ...repo, id: 'repo-b', displayName: 'beta', projectGroupId: group.id }
    const repoC: Repo = { ...repo, id: 'repo-c', displayName: 'gamma', projectGroupId: group.id }
    const groupedMap = new Map([
      [repoA.id, repoA],
      [repoB.id, repoB],
      [repoC.id, repoC]
    ])
    const repoOrder = new Map([
      [repoA.id, 0],
      [repoB.id, 1],
      [repoC.id, 2]
    ])

    const rows = buildRows(
      'repo',
      [
        { ...worktree, id: 'wt-a', repoId: repoA.id },
        { ...worktree, id: 'wt-b', repoId: repoB.id },
        { ...worktree, id: 'wt-c', repoId: repoC.id }
      ],
      groupedMap,
      null,
      new Set(),
      repoOrder,
      undefined,
      'manual',
      undefined,
      undefined,
      false,
      undefined,
      [group]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-1',
      'repo:repo-a',
      'repo:repo-b',
      'repo:repo-c'
    ])
  })

  it('sorts a dragged project between repo-order fallbacks inside a group', () => {
    const group: ProjectGroup = {
      id: 'group-1',
      name: 'Platform',
      parentPath: '/platform',
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const repoA: Repo = { ...repo, id: 'repo-a', displayName: 'alpha', projectGroupId: group.id }
    const repoB: Repo = { ...repo, id: 'repo-b', displayName: 'beta', projectGroupId: group.id }
    const repoC: Repo = {
      ...repo,
      id: 'repo-c',
      displayName: 'gamma',
      projectGroupId: group.id,
      projectGroupOrder: 500
    }
    const groupedMap = new Map([
      [repoA.id, repoA],
      [repoB.id, repoB],
      [repoC.id, repoC]
    ])
    const repoOrder = new Map([
      [repoA.id, 0],
      [repoB.id, 1],
      [repoC.id, 2]
    ])

    const rows = buildRows(
      'repo',
      [
        { ...worktree, id: 'wt-a', repoId: repoA.id },
        { ...worktree, id: 'wt-b', repoId: repoB.id },
        { ...worktree, id: 'wt-c', repoId: repoC.id }
      ],
      groupedMap,
      null,
      new Set(),
      repoOrder,
      undefined,
      'manual',
      undefined,
      undefined,
      false,
      undefined,
      [group]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-1',
      'repo:repo-a',
      'repo:repo-c',
      'repo:repo-b'
    ])
  })

  it('orders repos inside a Project Group by activity in recent mode, keeping tabOrder', () => {
    const groupA: ProjectGroup = {
      id: 'group-a',
      name: 'Platform',
      parentPath: '/platform',
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder: 1,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const groupB: ProjectGroup = { ...groupA, id: 'group-b', name: 'Infra', tabOrder: 0 }
    // Inside group A: repoStale ordered first by projectGroupOrder, but repoFresh
    // is more recently active so recent mode must lift it above repoStale.
    const repoStale: Repo = {
      ...repo,
      id: 'repo-stale',
      displayName: 'stale',
      projectGroupId: groupA.id,
      projectGroupOrder: 0
    }
    const repoFresh: Repo = {
      ...repo,
      id: 'repo-fresh',
      displayName: 'fresh',
      projectGroupId: groupA.id,
      projectGroupOrder: 1
    }
    const groupedMap = new Map([
      [repoStale.id, repoStale],
      [repoFresh.id, repoFresh]
    ])
    const worktrees = [
      { ...worktree, id: 'wt-stale', repoId: repoStale.id, lastActivityAt: 10 },
      { ...worktree, id: 'wt-fresh', repoId: repoFresh.id, lastActivityAt: 500 }
    ]

    const rows = buildRows(
      'repo',
      worktrees,
      groupedMap,
      null,
      new Set(),
      undefined,
      undefined,
      'recent',
      {},
      new Map(worktrees.map((entry) => [entry.id, entry])),
      false,
      undefined,
      // Group headers always follow tabOrder (Infra=0 before Platform=1),
      // independent of projectOrderBy.
      [groupA, groupB]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-b',
      'project-group:group-a',
      'repo:repo-fresh',
      'repo:repo-stale'
    ])
  })

  it('orders Project Group siblings by tabOrder within each parent bucket', () => {
    const rootA: ProjectGroup = {
      id: 'group-root-a',
      name: 'Platform',
      parentPath: '/platform',
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder: 20,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const rootB: ProjectGroup = {
      ...rootA,
      id: 'group-root-b',
      name: 'Infrastructure',
      tabOrder: 10
    }
    const childLate: ProjectGroup = {
      ...rootA,
      id: 'group-child-late',
      name: 'late',
      parentGroupId: rootB.id,
      tabOrder: 30
    }
    const childEarly: ProjectGroup = {
      ...rootA,
      id: 'group-child-early',
      name: 'early',
      parentGroupId: rootB.id,
      tabOrder: 5
    }

    const rows = buildRows(
      'repo',
      [],
      new Map(),
      null,
      new Set(),
      undefined,
      undefined,
      'recent',
      {},
      undefined,
      false,
      undefined,
      [rootA, rootB, childLate, childEarly]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-root-b',
      'project-group:group-child-early',
      'project-group:group-child-late',
      'project-group:group-root-a'
    ])
    expect(rows.filter((row) => row.type === 'header').map((row) => row.projectGroupDepth)).toEqual(
      [0, 1, 1, 0]
    )
  })
})

describe('buildRows Name project order', () => {
  // Parent folders invert the bare-name order: by displayName it is alpha, beta;
  // by rendered label it is a/beta, z/alpha. A sort that ran before labelling — or
  // one that read repo.displayName — would produce the first order.
  const repoAlpha: Repo = { ...repo, id: 'repo-alpha', path: '/z/alpha', displayName: 'alpha' }
  const repoBeta: Repo = { ...repo, id: 'repo-beta', path: '/a/beta', displayName: 'beta' }
  const map = new Map([
    [repoAlpha.id, repoAlpha],
    [repoBeta.id, repoBeta]
  ])
  const wAlpha: Worktree = { ...worktree, id: 'wt-alpha', repoId: repoAlpha.id }
  const wBeta: Worktree = { ...worktree, id: 'wt-beta', repoId: repoBeta.id }

  it('orders project headers by the qualified label, not the repo display name', () => {
    const rows = buildRows(
      'repo',
      [wAlpha, wBeta],
      map,
      null,
      new Set(),
      new Map([
        [repoAlpha.id, 0],
        [repoBeta.id, 1]
      ]),
      undefined,
      'name'
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.label)).toEqual([
      'a/beta',
      'z/alpha'
    ])
  })

  it('orders by name even when no manual repoOrder is persisted', () => {
    const rows = buildRows(
      'repo',
      [wAlpha, wBeta],
      map,
      null,
      new Set(),
      undefined,
      undefined,
      'name'
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'repo:repo-beta',
      'repo:repo-alpha'
    ])
  })

  it('orders projects inside a Project Group by name while the group keeps its tab order', () => {
    const makeGroup = (id: string, name: string, tabOrder: number): ProjectGroup => ({
      id,
      name,
      parentPath: `/${id}`,
      parentGroupId: null,
      createdFrom: 'folder-scan',
      tabOrder,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    })
    // Zulu sorts last by name but first by tabOrder; group headers must follow tabOrder.
    const zulu = makeGroup('group-zulu', 'Zulu', 0)
    const alpha = makeGroup('group-alpha', 'Alpha', 1)
    // projectGroupOrder deliberately contradicts the name order, so a within-group
    // sorter that fell through to the manual rank would put z/alpha first.
    const grouped = new Map([
      [repoAlpha.id, { ...repoAlpha, projectGroupId: zulu.id, projectGroupOrder: 0 }],
      [repoBeta.id, { ...repoBeta, projectGroupId: zulu.id, projectGroupOrder: 1 }]
    ])
    const rows = buildRows(
      'repo',
      [wAlpha, wBeta],
      grouped,
      null,
      new Set(),
      undefined,
      undefined,
      'name',
      undefined,
      undefined,
      false,
      undefined,
      [zulu, alpha]
    )

    expect(rows.filter((row) => row.type === 'header').map((row) => row.key)).toEqual([
      'project-group:group-zulu',
      'repo:repo-beta',
      'repo:repo-alpha',
      'project-group:group-alpha'
    ])
  })

  it('breaks case-only label differences on the exact label, not encounter order', () => {
    // Base-sensitivity collation reports dup/Orca and DUP/orca as equal, so the
    // comparator has to fall through to an exact comparison to stay deterministic.
    const upper: Repo = { ...repo, id: 'repo-upper', path: '/dup/Orca', displayName: 'Orca' }
    const lower: Repo = { ...repo, id: 'repo-lower', path: '/DUP/orca', displayName: 'orca' }
    const dupMap = new Map([
      [upper.id, upper],
      [lower.id, lower]
    ])
    const wUpper: Worktree = { ...worktree, id: 'wt-upper', repoId: upper.id }
    const wLower: Worktree = { ...worktree, id: 'wt-lower', repoId: lower.id }

    const forward = buildRows(
      'repo',
      [wUpper, wLower],
      dupMap,
      null,
      new Set(),
      undefined,
      undefined,
      'name'
    )
    const reversed = buildRows(
      'repo',
      [wLower, wUpper],
      dupMap,
      null,
      new Set(),
      undefined,
      undefined,
      'name'
    )

    const keys = (rows: ReturnType<typeof buildRows>): string[] =>
      rows.filter((row) => row.type === 'header').map((row) => row.key)
    expect(keys(forward)).toEqual(keys(reversed))
  })

  it('breaks fully equal labels on the section key so the order survives a re-render', () => {
    // Two repos on one path alias onto a single label, so both tiers above tie and
    // only the section key is left. Without it the winner would be whichever the
    // grouping Map happened to yield first, and that is worktree-encounter order.
    const upper: Repo = { ...repo, id: 'repo-upper', path: '/dup/Orca', displayName: 'Orca' }
    const lower: Repo = { ...repo, id: 'repo-lower', path: '/dup/Orca', displayName: 'orca' }
    const dupMap = new Map([
      [upper.id, upper],
      [lower.id, lower]
    ])
    const wUpper: Worktree = { ...worktree, id: 'wt-upper', repoId: upper.id }
    const wLower: Worktree = { ...worktree, id: 'wt-lower', repoId: lower.id }

    const forward = buildRows(
      'repo',
      [wUpper, wLower],
      dupMap,
      null,
      new Set(),
      undefined,
      undefined,
      'name'
    )
    const reversed = buildRows(
      'repo',
      [wLower, wUpper],
      dupMap,
      null,
      new Set(),
      undefined,
      undefined,
      'name'
    )

    const keys = (rows: ReturnType<typeof buildRows>): string[] =>
      rows.filter((row) => row.type === 'header').map((row) => row.key)
    expect(keys(forward)).toEqual(['repo:repo-lower', 'repo:repo-upper'])
    expect(keys(reversed)).toEqual(keys(forward))
  })
})
