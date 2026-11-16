import React from 'react'
import type { Repo } from '../../../../../../shared/repo-types'
import { ProjectActivityTitle } from '../../ProjectActivityIndicator'
import { ProjectUncommittedChangesIndicator } from '../../UncommittedChangesIndicator'

/** A header's name, dimmed by agent activity for a project, and the project's uncommitted-changes dot. */
export function SectionHeaderTitle({
  label,
  repo,
  dirtyIds
}: {
  label: string
  /** Set on project headers only. */
  repo: Repo | undefined
  /** Repo ids with uncommitted changes. */
  dirtyIds: ReadonlySet<string>
}): React.JSX.Element {
  return (
    <>
      {repo ? (
        <ProjectActivityTitle repoId={repo.id} label={label} />
      ) : (
        <div className="min-w-0 truncate text-[13px] font-semibold leading-4" title={label}>
          {label}
        </div>
      )}
      <ProjectUncommittedChangesIndicator hasUncommittedChanges={!!repo && dirtyIds.has(repo.id)} />
    </>
  )
}
