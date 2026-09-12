# Resuming vs. Forking an Agent Session

Orca resumes an agent conversation from three directions, and two of them must reuse the provider's session id while the third must not. Getting that backwards is silent in both directions and corrupts data in one, so the split is deliberate rather than incidental.

## The rule

**A wake or a resume reuses the session id. A fork mints a new one.**

`src/shared/agent-session-resume.ts` has one exported argv builder per side:

| Caller                                                                 | Builder                  | Session id |
| ---------------------------------------------------------------------- | ------------------------ | ---------- |
| Agent Session History resume, hibernation wake, cold restore, AI Vault | `getAgentResumeArgv`     | **same**   |
| Session fork ("Full conversation")                                     | `getAgentForkResumeArgv` | **new**    |

They are separate exports on purpose: a caller has to ask for the forking argv, and cannot inherit it from the shared one. `canForkAgentConversation` is the UI predicate and is **derived** from `getAgentForkResumeArgv` rather than restating its condition, so the dialog can never offer a fork the launch would refuse.

## Why a fork cannot reuse the id

A Claude transcript is keyed by `sessionId` and is **global to the machine** — no worktree owns it. Two panes in different worktrees that both run `claude --resume <sameId>` append to the same `.jsonl` and interleave one conversation, because the dedupe guard in `src/renderer/src/lib/resume-sleeping-agent-session.ts` (`activeOrQueuedResumeClaimsProviderSession`) scopes every branch to a single worktree and cannot see across the boundary.

`--fork-session` is what avoids it: the child mints its own id at startup, writes into the **new** cwd's project directory, and leaves the parent's transcript untouched. Without the flag, forking would deliberately reproduce that corruption on every use.

## Why the default must not change

`getAgentResumeArgv` is on the hibernation path (`agent-hibernation-pane-eligibility.ts`, `resume-sleeping-agent-session.ts`). Waking a sleeping pane is a resume, not a fork — adding a fork flag to the default would branch a new conversation every time any pane woke up, with no user-visible signal. `src/shared/agent-session-resume.test.ts` pins the plain Claude argv against exactly that regression; do not relax it.

## Adding a second forkable agent

`getAgentForkResumeArgv` returns `null` for every agent except Claude. That is a safety decision, not a gap. Claude is forkable because of two properties no other supported CLI documents: `--fork-session` mints a new id when resuming, and ids resolve globally rather than per-`cwd`, so a resume issued from a brand-new worktree still finds the parent transcript. Resuming any other agent into a second worktree would reuse the parent's id — the corruption above. Before adding an agent:

1. Confirm the CLI has a documented flag that creates a **new** session id when resuming, and that it resolves session ids globally rather than per-`cwd` (Claude does; verify rather than assume).
2. Add it to `getAgentForkResumeArgv` only — the UI predicate follows automatically.
3. Leave `getAgentResumeArgv` alone.

## Why the ineligible state is disabled, not downgraded

The weaker mode is always available, so an ineligible pane could just fall through to it silently — the user still gets _a_ fork. That is the exact failure this feature exists to remove: the old behaviour looked like a conversation fork and was not one, and nothing said so.

So eligibility is surfaced, not absorbed. The card renders disabled with the reason in text, and `startAgentSessionFork` refuses rather than downgrades if the session disappears between the dialog opening and the click.

## Upstream context

Forking has a long history in `stablyai/orca` and the state of it is easy to misread. Issue #2026 ("Fork existing agent sessions (context branching)") proposed three levels of fork and was **closed as completed** when only the transcript-level one shipped — so the tracker says done while the conversation-level fork was still missing. PR #5609 ("first-class agent session forking") built a much larger subsystem and stalled. PR #19340 forks _structured/native chat_ from a completed turn and explicitly excludes new-workspace placement, so it does not cover the terminal-pane path. A separate "fork in this worktree" PR was closed as a duplicate, so the same-worktree variant has been proposed and declined.

Read #2026's closed state as "one of three levels shipped", not as "forking is done".

## Launching the fork

The renderer passes the argv through `launchAgentInNewTab`'s `agentArgs` (`src/renderer/src/components/terminal-pane/terminal-agent-session-fork.ts`), which re-tokenizes and re-quotes it for the target shell, and sends no scrollback prompt — the resumed conversation already holds the history.

Because the argv travels as one string and is re-split there, `getAgentForkResumeArgv` refuses any session id that is not a single bare word. Re-quoting makes shell metacharacters inert, so this is not an injection guard; it is a correctness one. An id containing a space would split into two argv words and resume the _wrong_ id, and one containing a quote would fail tokenization and silently fall back to the clipboard. `normalizeSessionId` permits both.

Do **not** seed `providerSession` on the launch. The AI Vault resume path does (`src/renderer/src/lib/ai-vault-resume-command.ts`) because it reuses the id; a fork's child mints its own, so seeding the parent's would make Orca believe both panes own one session. Let the agent hooks report the forked id when it arrives.
