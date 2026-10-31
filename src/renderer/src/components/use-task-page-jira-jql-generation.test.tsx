// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JiraJqlGenerationResult } from '../../../shared/jira/jira-jql-generation'
import type { JiraFavouriteFilter } from '../../../shared/jira-favourite-filters'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { useTaskPageJiraJqlGeneration } from './use-task-page-jira-jql-generation'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  cancel: vi.fn(),
  applied: vi.fn(),
  resume: vi.fn(),
  refresh: vi.fn(),
  clearSaved: vi.fn()
}))
vi.mock('@/runtime/runtime-jira-jql-generation-client', () => ({
  generateRuntimeJiraJql: mocks.generate,
  cancelRuntimeJiraJql: mocks.cancel
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

function deferred() {
  let resolve!: (value: JiraJqlGenerationResult) => void
  const promise = new Promise<JiraJqlGenerationResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const project = { id: '10', key: 'ABC', name: 'Alpha', siteId: 'site-1' }
const favourite: JiraFavouriteFilter = {
  id: 'f1',
  name: 'Mine',
  jql: 'filter = Mine',
  siteId: 'site-1'
}

function setup(initial: { search?: string; favourite?: JiraFavouriteFilter | null } = {}) {
  return renderHook(() => {
    const [jiraSearchInput, setJiraSearchInput] = useState(initial.search ?? '')
    const generation = useTaskPageJiraJqlGeneration({
      accountBackedTaskSourceHostId: LOCAL_EXECUTION_HOST_ID,
      jiraTaskSourceContext: null,
      jiraTaskSourceScopeKey: 'scope',
      selectedJiraSiteId: 'site-1',
      jiraSites: [],
      jiraProjectFilter: project,
      jiraFavouriteFilter: initial.favourite ?? null,
      jiraSearchInput,
      setJiraSearchInput,
      setAppliedJiraSearch: mocks.applied,
      clearJiraSavedFilterSelection: mocks.clearSaved,
      setTaskResumeState: mocks.resume,
      setJiraRefreshNonce: mocks.refresh,
      activeJiraPreset: 'assigned',
      selectedJiraStatuses: [],
      jiraCurrentSprint: false,
      jiraStatusCatalog: null,
      jiraJqlRejection: null
    })
    return { generation, jiraSearchInput, setJiraSearchInput }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cancel.mockResolvedValue(undefined)
  mocks.clearSaved.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe('useTaskPageJiraJqlGeneration', () => {
  it('writes the generated JQL into the search field and runs it', async () => {
    mocks.generate.mockResolvedValue({ success: true, jql: 'type = Bug' })
    const { result } = setup({ search: 'project = ABC' })
    let applied = false
    await act(async () => {
      applied = await result.current.generation.generate('only bugs')
    })
    expect(applied).toBe(true)
    expect(result.current.jiraSearchInput).toBe('type = Bug')
    expect(mocks.applied).toHaveBeenCalledWith('type = Bug')
    expect(mocks.resume).toHaveBeenCalledWith({ jiraQuery: 'type = Bug' })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.clearSaved).toHaveBeenCalled()
    expect(mocks.generate.mock.calls[0][1]).toMatchObject({
      siteId: 'site-1',
      instruction: 'only bugs',
      baseJql: 'project = ABC',
      projectKey: 'ABC'
    })
  })

  it.each([
    [{ favourite }, 'filter = Mine'],
    [{ search: '  type = Task  ' }, 'type = Task'],
    [{}, expect.stringMatching(/^project = "10" AND \(assignee = currentUser\(\)/)]
  ])('edits the query the user sees: %j', async (initial, baseJql) => {
    mocks.generate.mockResolvedValue({ success: true, jql: 'x = 1' })
    const { result } = setup(initial)
    await act(async () => {
      await result.current.generation.generate('anything')
    })
    expect(mocks.generate.mock.calls[0][1].baseJql).toEqual(baseJql)
  })

  it('drops a late result when the user edited the query meanwhile', async () => {
    const pending = deferred()
    mocks.generate.mockReturnValue(pending.promise)
    const { result } = setup({ search: 'project = ABC' })
    let generation!: Promise<boolean>
    act(() => {
      generation = result.current.generation.generate('only bugs')
    })
    act(() => result.current.setJiraSearchInput('typed by hand'))
    await act(async () => {
      pending.resolve({ success: true, jql: 'type = Bug' })
      expect(await generation).toBe(false)
    })
    expect(result.current.jiraSearchInput).toBe('typed by hand')
    expect(mocks.applied).not.toHaveBeenCalled()
    expect(result.current.generation.generating).toBe(false)
  })

  it('surfaces a failure and leaves the query untouched', async () => {
    mocks.generate.mockResolvedValue({ success: false, error: 'claude not found on PATH' })
    const { result } = setup({ search: 'project = ABC' })
    await act(async () => {
      await result.current.generation.generate('only bugs')
    })
    expect(result.current.generation.error).toBe('claude not found on PATH')
    expect(result.current.jiraSearchInput).toBe('project = ABC')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
