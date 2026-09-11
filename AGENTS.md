# Useful Commands

- **Before handoff**: `pnpm check:changed --maxWorkers=2` (format, lint, typecheck, affected tests, ratchets; cached when nothing changed)
  - Run this gate with local port permission; restricted sandboxes can turn network suites into a long series of `listen EPERM` failures. Clear `ELECTRON_RENDERER_URL` and `NODE_ENV_ELECTRON_VITE` for the run. Rerun affected files with port permission before classifying sandbox failures as product regressions.
- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts]`; affected only: `pnpm test:changed [path] --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests))
- **Lint**: `oxlint`, or `pnpm run check:code-quality:changed` for changed files (full `pnpm lint` is slow); format with `pnpm format`
- **Design system**: `pnpm run lint:design-system` for the full renderer report (not a gate); the changed-lines gate above is what CI enforces
- **New user-facing strings**: add the English text to `src/renderer/src/i18n/locales/en.json`, then regenerate the derived catalogs with `pnpm run sync:localization-catalog` and `pnpm run sync:localization-runtime-catalog` — the `verify:localization-*` gates inside `pnpm lint` fail otherwise. Leave the other locales alone; they fall back to the inline English default.
- `pnpm format` runs `oxfmt` over the whole repo, markdown included, and it mangles nested lists and fenced blocks. Format the files you changed instead: `npx oxfmt --write <paths>`.

# Ensure main is always releasable

Never break main. Use stacks or collapse PRs before merge

# Design System

Annotation and review-note pickers keep attached agents selectable when `done` or `working` status expires. Preserve the host's guarded checks before paste and Enter; picker eligibility alone does not prove delivery.

The Messages sidebar icon highlights unseen log entries under 72 hours old.
Only successful page loads acknowledge returned entries; metadata polling never
acknowledges them. See [Messages behavior](docs/readme/messages.md).

Automation run-ahead buttons use the cooldown window before `nextRunAt` and `lastDispatchedAt`, never `lastRunAt` (skips update it). Reuse the owner-qualified Run Now action; see [run-ahead behavior](docs/readme/automation-run-ahead.md).

When changing automation duplication, read [duplication behavior](docs/readme/automation-duplication.md).
Keep the owner-qualified create path, saved schedule/timezone and enabled state;
never copy run history or reuse the source's creation key.

Desktop custom-cron descriptions use cRonstrue 3.38.0, exactly pinned, only after Orca validates the rule. Expand weekday fields containing Sunday `7` with Orca's parser before passing them to cRonstrue; replacing range endpoints directly can change their meaning. Preserve the dialect guards and raw-expression fallback; recheck advisories and verify npm signatures/provenance before upgrading it. CLI formatters remain independent.

The Workspace Board's fixed Sleeping lane is display-only. Reuse the sleep predicate, preserve saved status, and disable drag sources and drop targets for sleeping cards. Keep it separate from persisted/customizable workspace statuses.

Size the board sheet from every rendered lane, including Sleeping, using the saved column width and the shared lane gap. Cap it at the viewport so small windows can still scroll.

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. Read the `docs/styleguide/` deep dive it links only when your change touches that topic. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

# Electron UI Validation

Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`,
`app.focus()`, or OS activation. Use CDP screenshots of hidden renderers. Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
Rebuild modified launch-policy code before running an app; stale build wrappers are not safe.

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale — a function, component, IPC channel, state store, or whole subsystem/flow — check whether an existing implementation already does the job. Extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Assertions: Prefer Checked Types

Avoid type assertions except `as const`. Unavoidable casts need a line-specific `SAFETY:` explanation:

# First Class Citizens

Every change must consider these areas:

## Cross-Platform Support

Support macOS, Linux, and Windows. Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).

## Remote Use Case

Support remote execution as well as local. Clients and servers update independently; preserve compatibility across mixed versions.

## Mobile

Any feature should be considered for parity on mobile

## Folder Workspaces

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

# Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).

For a failed GitHub Actions run, inspect the failed jobs and retry with `gh run rerun <run-id> --failed --repo stablyai/orca`. Preserve successful jobs; use a full rerun only when the failure requires revalidating them. A code fix needs a new push and fresh checks, not a retry of the old SHA.

# Tests

Avoid adding low-value tests. These might be fine for development but offer negative value when checked in. [Anti-patterns](./docs/agents-md-refs/test-antipatterns.md)

# Required Runtime Activation Handoff

After any product-source change, the final response must include a short **Runtime activation** section. Classify the changed paths and state exactly what the user must do next:

| Changed paths                        | Required activation handoff                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/**` only               | Vite HMR picks it up; no restart — unless the change only takes effect on mount (see below), then **View → Reload**.                                                                                                                      |
| `src/main/**` or `src/preload/**`    | Restart `pnpm dev`; renderer reload alone is insufficient.                                                                                                                                                                                |
| `src/shared/**`                      | Decide by who runs the changed code: restart `pnpm dev` if main or preload executes it, run `pnpm run build:cli` if the CLI does; if only the renderer does (e.g. a new export only the renderer imports), treat it as `src/renderer/**`. |
| `src/cli/**`                         | Run `pnpm run build:cli`; the CLI is not watched.                                                                                                                                                                                         |
| New renderer dependency              | Run normal `pnpm install`. If bundled dev still serves bare package imports, restart `pnpm dev` using the safe sequence below; a window reload cannot rebuild its dependency graph.                                                       |
| Documentation, tests, or config only | No runtime activation unless the changed config is loaded by a running process.                                                                                                                                                           |

**HMR delivering a module is not the same as the change taking effect.** React Fast Refresh re-renders the component but does not tear down and re-run a mounted `useEffect` whose deps are unchanged, so anything that only happens at mount — a new `setInterval`, event listener, subscription, or any edited effect body behind stable deps — stays dormant until the window reloads. Same for a module-scope side effect that already ran. When the change is of that shape, say **View → Reload** explicitly instead of "HMR picks it up".

For mixed changes, report every required step and use the strictest row. If `pnpm dev` was not started by this session, do not stop the user's process; say that the restart is pending and give the safe sequence: focus the dev window, quit it with `⌘Q`, verify `pgrep -f "Orca from source"` and `lsof -i :5173 -sTCP:LISTEN -P -n`, then relaunch `pnpm dev`. Never recommend `Ctrl+C` or killing the terminal daemon to activate a change. If the change is not packaged or deployed to a production installation, say so explicitly and distinguish that from local-dev activation.

# Activating a Change in a Running `pnpm dev`

After adding a renderer dependency, check the live bundled-dev output as well as a fresh browser run. The component-fixture server uses ordinary Vite mode and cannot validate the long-running bundled-dev dependency graph. An installed `cronstrue` worked in a fresh Electron renderer configuration while the live server emitted bare package imports. Restart that server before changing formatter code; the cold check alone does not prove the live instance recovered.

Merging or fast-forwarding the checkout is **not** enough, and how you stop the dev server decides whether live agents survive. Only the renderer is hot.

| What you changed                                                        | What picks it up                                |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| `src/renderer/**`                                                       | vite HMR — live, unless mount-only (reload)     |
| `src/main/**`, `src/preload/**`, `src/shared/**` run by main or preload | **restart `pnpm dev`**                          |
| `src/cli/**`, `src/shared/**` run by the CLI                            | **`pnpm run build:cli`** — never watched, ~1.5s |

`electron.vite.config.ts` sets no `build.watch`, so electron-vite's "rebuild main → restart electron app" hook never arms: `out/main/` (`index.js` plus about 430 files in `chunks/`, so search the whole folder) is built once at `pnpm dev` startup and never again. A window reload reloads the renderer only. A stale main bundle reads as a _half-applied_ feature — new UI appears, new IPC channel rejects — so confirm with a known-positive control before believing a grep:

```sh
rg -l -F '<a symbol you know is there>' out/main --glob '*.js'   # proves the search works
rg -l -F '<your new symbol>' out/main --glob '*.js'              # nothing => main predates your change
find src/cli src/shared -name '*.ts' -newer out/cli/index.js -print -quit   # any output => CLI stale
```

## Reload the window with View → Reload, not ⌘R

Orca binds no `app.reload` shortcut. On macOS ⌘R is `tab.rename` and, with the embedded browser focused, `browser.reload` (`src/shared/keybindings/definitions-core-2.ts`, `definitions-core-3.ts`) — so telling the user to press ⌘R renames their tab and reloads nothing. The renderer reload is **View → Reload** / **Force Reload** in the menu bar (`src/main/menu/register-app-menu.ts`), which carry no accelerator by design. `app.forceReload` (⌘⇧R) exists but is swallowed by a focused terminal under a `terminal-first` shortcut policy, and matches `browser.hardReload` inside the browser — so name the menu item, not the chord.

## Quit with ⌘Q, not Ctrl+C

`installDevParentSignalQuit` (`src/main/startup/configure-process.ts`) traps `SIGINT`/`SIGTERM` and takes the `shutdownDaemon()` path, which synthesizes `pty:exit` for every active session — **Ctrl+C in the dev terminal reaps every live agent.** ⌘Q takes `disconnectDaemon()` and leaves the PTYs alive for warm reattach. So: ⌘Q the dev window first, then restart. Same reason `pnpm dev` wants `nohup … & disown` rather than a shell that can die.

Do **not** kill the terminal daemon to pick up a change. It is versioned by `package.json`'s version string, so an unchanged version means it is adopted and every agent survives the restart; killing it buys nothing and costs every session.

## Verify teardown before relaunching

⌘Q quits the **focused instance only** — an unfocused or windowless one keeps running old code, and its panes keep executing its stale main bundle.

```sh
pgrep -f "Orca from source"              # must be empty
lsof -i :5173 -sTCP:LISTEN -P -n         # must be empty, or the next `pnpm dev` attaches to a stale server
```

Use plain `kill <pid>` on a survivor, never `kill -9` — the latter skips the flush that preserves the pane→session mapping. And kill stale instances **before** exercising a change that adds a persisted field: all dev instances share `orca-dev/profiles/local-default/orca-data.json` last-writer-wins, and an instance that predates your field writes it back out at its default.

## Dev runs a different profile than the installed app

`pnpm dev` uses `orca-dev` userData, the packaged app uses `orca`, which is what lets both run at once. Your real workspaces, automations and settings are not in the dev profile. To exercise a change against real records, quit the packaged app first (one profile, one single-instance lock) and run:

```sh
ORCA_DEV_USER_DATA_PATH="$HOME/Library/Application Support/orca" pnpm dev
```

# Agent Sessions

## Resuming vs. Forking an Agent Session

A wake, a cold restore and an Agent Session History resume all reuse the provider's session id; a session fork must mint a new one. Two panes resuming the same Claude id append to one transcript, because the dedupe guard is worktree-scoped. Before touching either argv builder in `src/shared/agent-session-resume.ts`, or adding a second forkable agent, read [`docs/reference/agent-session-fork-argv.md`](./docs/reference/agent-session-fork-argv.md).

## Agent Terminal Screens

A rule that reads what an agent CLI paints on a terminal — readiness, blocked prompts, idle, interrupted — must be written against a captured transcript, not a remembered screen. Use `config/scripts/capture-agent-pty-transcript.mjs` to keep escapes and wrapping intact and scrub account identifiers before they reach git; [`docs/reference/agent-pty-transcript-capture.md`](./docs/reference/agent-pty-transcript-capture.md) covers its traps.

A Claude pane's derived tail is **empty** — it repaints in place, so every rule over `buildPreview` is blind to it. Read `readTerminal(handle, { screen: true })` instead, and replay a fixture at the PTY size its `.meta.json` records or the screen rewraps into text no terminal ever showed. Claude also emits no hook at all on a user interrupt; `src/shared/claude-terminal-interrupt.ts` settles it from the Escape keypress and the title going idle.
