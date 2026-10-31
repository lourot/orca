# Backlog.md in Tasks

Select **Tasks → Backlog.md**, then choose a project and execution host. Orca remembers
the last chosen project (`defaultBacklogProject` setting) and reopens on it. Git repositories
without a hosting provider and folder projects are both supported. Search matches IDs,
titles, labels and task bodies; status filters use the project's configured status names.
Rows show the type as a coloured icon, the status coloured by its place in the configured
workflow (first grey, last green as done, the rest blue), the priority (High red, Medium
amber, Low blue), the due date (red once passed on a task that isn't done), the IDs of
dependencies that aren't done yet, and labels. Tasks are listed most urgent first: open
before done, then by due date (undated last), then by configured priority. Details show the task's fields (priority, type, assignees,
labels, due date, references, documentation) above the complete Markdown body, including
acceptance criteria, plan and notes.

## Relations

Details list a task's relations; a related task the board knows opens in place.

- **Depends on**: the task's `dependencies` (`backlog task edit --depends-on`), i.e. what it
  is blocked by.
- **Blocks**: tasks whose dependencies name this one. Backlog.md stores only one side.
- **Parent** and **Subtasks**: `parent_task_id`, set at creation (`backlog task create -p`).
- **Related**: Backlog.md has no such field, so a reference that is a task ID (`--ref TASK-3`)
  counts as related, in both directions: one side is enough.

Reading requires an initialized Backlog.md project, not an account or CLI installation.
Orca recognizes `backlog.config.yml` (including `backlog_directory`), `backlog/config.yml`
and `.backlog/config.yml`, with `config.yaml` accepted for folder-local configuration.
Only active tasks in the selected checkout's `tasks` directory are listed; drafts,
archived/completed files and tasks on other Git branches are not merged into this view.

## Create and edit

Install **`backlog.md@1.55.3` as a pinned project dependency** on the execution host.
Orca invokes that project's `node_modules/backlog.md/cli.js` directly, with separate
arguments, a timeout and bounded output. It never invokes `npx`, downloads packages,
uses a global CLI or writes task Markdown itself. Other CLI versions remain read-only
until their command contract is validated. Missing or unsupported installations are
explained inline without preventing browsing.

Creation/editing supports title, description, configured status, priority, type, due date,
assignees, labels, dependencies and references. Priority and type use the project's
configured `priorities` and `types` (Backlog.md's defaults when unset). Backlog.md cannot
clear a priority once set. Parents, acceptance criteria and documentation stay CLI-only.
Only changed fields are passed to the CLI, which preserves the rest and the structured
sections.

An edit is atomic against other Backlog CLI users, such as agents. Orca holds the CLI's
own per-task lock (`<backlog>/.locks/task-<id>`) while it re-reads the task, checks that
the fields it loaded are unchanged, and runs the CLI edit (with `USE_GLOBAL_TASK_ID_LOCK=false`,
since Orca already holds the lock). A concurrent CLI edit of that task fails with "is
being modified by another process" and can be retried; if the task changed first, Orca
refuses the save and asks for a refresh. If another process holds the lock for more than
about 2 seconds, Orca's save fails without writing. The lock path follows the pinned
1.55.3 CLI. To avoid hidden Git/network/hook effects,
editing requires these project settings:

```yaml
auto_commit: false
remote_operations: false
check_active_branches: false
```

Projects with `onStatusChange`, and individual tasks with a status hook, must be edited
with the CLI directly. Orca does not change project configuration to bypass this gate.
A save refused before the CLI runs (task lock held, task changed on disk, invalid
value, missing CLI or unsafe configuration) wrote nothing: the runtime returns
`backlog_not_saved`, and the editor shows the reason and lets you retry at once. After
any other failed or interrupted save, refresh before retrying: the CLI may already have
written the task. Saves are never retried automatically.

## Start work

**Start workspace** opens Orca's existing workspace/agent composer. Confirm the project,
agent and setup policy there. The selected task ID and bounded, explicitly untrusted
source context become the agent's startup draft through the existing launch mechanism.
Starting a workspace does not change the task status. The source project and execution
host must remain selected; switching either is refused rather than reading the task
from a different checkout. No synthetic GitHub issue number or hosted issue URL is used.

## Boundaries and compatibility

Filesystem reads and CLI writes run on the selected execution host. SSH projects are
refused, never read from local files: the SSH relay that would run the CLI was removed
(#27215). Paired runtimes advertise `tasks.backlog.v1`; older runtimes do not receive
Backlog calls. Editing fields beyond title, description and status needs
`tasks.backlog.fields.v1` too: an older runtime would drop them while reporting success,
so Orca offers only the three fields there. New reply fields are optional, so older
renderers ignore them and newer renderers show nothing from older runtimes. Native mobile has its own provider allowlist and does not expose
this source or its mutation RPC. Desktop/web renderers are the supported UI surface.

Runtime `backlog.execute` accepts a registered `repoId`, resolves its path on that runtime,
and routes to its execution host; a caller-supplied `repoPath` is not used. Runtime
transport authentication runs before dispatch, and mobile-scoped devices cannot call
this method. It operates with the host user's authority, not a per-project sandbox.

Task/config paths cannot escape the project or use symlinks. Package-manager links are
accepted only when the resolved CLI package stays inside the project. `cli.js` is a shim
that runs a native binary found by Node module lookup, which also searches parent folders;
every native package it could load must be the pinned version inside the project. Reads are bounded
to 128 KiB per task, 16 MiB of task content, 10,000 directory entries and 100 rows per page.
The adapter refuses oversized or duplicate-ID data instead of silently returning an
incomplete board. These checks are not a sandbox for an untrusted project dependency:
the installed Backlog CLI executes with the host user's permissions.

## Contract evidence and tests

The command and storage contract was checked against Backlog.md `v1.48.0`, commit
`da0784d41ad3807fdc34e5501afe3fa950deff94` in
[MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md/tree/da0784d41ad3807fdc34e5501afe3fa950deff94):
`CLI-INSTRUCTIONS.md`, `ADVANCED-CONFIG.md`, config discovery, task metadata and
create/edit command definitions. For `v1.55.3` (commit
`0cf4fdbc70020327f4366a29d3f405f83d180301`), `parseConfig` still reads `auto_commit`,
`remote_operations`, `check_active_branches` and `onStatusChange` line by line; only list
keys (`statuses`, `labels`, ...) moved to a stricter parser. The real-CLI test below
passes against `v1.55.3`. Its license is MIT, Copyright (c) 2025 Backlog.md.
The adapter invokes the installed CLI; it does not vendor Backlog.md implementation.

`src/main/backlog/backlog-service.test.ts` covers filesystem/argument boundaries and has
an opt-in real-CLI integration test. Set `ORCA_BACKLOG_TEST_PACKAGE` to an installed
`backlog.md@1.55.3` package directory; the test copies that package and its native sibling
to a temporary project before running create/edit. It does not modify the original
installation. It also exercises a title-only edit of a legacy multiline description.
Parser regressions cover whitespace-delimited config keys inside YAML literals and
quoted/merged task hooks. Hook detection reads complete YAML metadata and fails closed
on unsupported metadata syntax rather than discarding unknown fields.

Host-routing and renderer tests cover ownership, capability refusal, source identity,
browsing, saves and opening the workspace composer. Execution has a 45-second overall
response deadline (including scanning), with a 30-second CLI limit and abort signaling;
the renderer RPC ceiling is 65 seconds. A timeout
is not proof that writes stopped. Any unconfirmed save locks that editor, and closing
it keeps create/edit disabled until an explicit refresh succeeds. Inspect the refreshed
tasks before a new attempt; this is not persistent deduplication across page reloads.
These tests do not replace hidden-renderer UI validation or the full application build.
