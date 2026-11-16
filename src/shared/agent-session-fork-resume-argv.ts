import { getAgentForkArgv } from './agent-resume-argv'
import {
  isResumableTuiAgent,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from './agent-session-resume'

/** The fork argv travels as one string and the launcher re-splits it, so an id
 *  with whitespace would resume the *wrong* id and one with a quote would fail
 *  tokenization. `normalizeSessionId` permits both; Claude and Codex ids are
 *  normally UUIDs. */
const BARE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Argv that resumes a conversation into a *copy* under a new session id, for a fork
 *  into a fresh worktree.
 *
 *  Separate from `getAgentResumeArgv` so a caller must opt in: waking a
 *  hibernated pane has to reuse the same id.
 *
 *  Claude and Codex only: the worktree-fork launch is only wired and tested for them. */
export function getAgentForkResumeArgv(
  agent: ResumableTuiAgent,
  providerSession: AgentProviderSessionMetadata
): string[] | null {
  if ((agent !== 'claude' && agent !== 'codex') || !BARE_SESSION_ID.test(providerSession.id)) {
    return null
  }
  return getAgentForkArgv(agent, providerSession)
}

/** Whether this pane's conversation can be forked into a fresh worktree.
 *  Derived from the argv builder so the dialog can never offer a fork the
 *  launch would then refuse. */
export function canForkAgentConversation(
  agent: string | undefined,
  providerSession: AgentProviderSessionMetadata | undefined | null
): boolean {
  return Boolean(
    providerSession && isResumableTuiAgent(agent) && getAgentForkResumeArgv(agent, providerSession)
  )
}
