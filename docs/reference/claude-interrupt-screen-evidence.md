# Claude interrupts: what the transcripts show

`countClaudeInterruptMarkers` in `src/main/runtime/claude-interrupt-screen.ts` decides whether a
Claude pane has painted a user interrupt. It exists because **Claude Code emits no hook at all when
the user interrupts a turn**. The pane's own screen is therefore the only evidence the execution
host has.

The transcripts were recorded from a live `claude` with
[`agent-pty-transcript-capture.md`](./agent-pty-transcript-capture.md) and are committed under
`src/main/runtime/__fixtures__/`.
`src/main/runtime/claude-interrupt-transcripts.test.ts` replays them through the runtime.

## No hook reports an interrupt — measured, not assumed

All 25 Claude hook events were registered to a log via `--settings`, Claude was made to run
`Bash(sleep 120)`, and one ESC was sent into its PTY:

```
SessionStart / InstructionsLoaded / UserPromptSubmit / PreToolUse(Bash)
--- ESC ---
(nothing, 30s)
```

No `Stop`, no `StopFailure`, no `PostToolUseFailure`, no `Notification`, no `PermissionDenied`. The
four events before the ESC are the known-positive control: the wiring worked.

Upgrading does not change this. `is_interrupt` exists only on `PostToolUseFailure`, which this path
never fires, and 2.1.274's `Stop` payload is unchanged (`stop_hook_active`,
`last_assistant_message`, `background_tasks`). `claude-events.ts` reads `is_interrupt` on turn
boundaries only, which is dead code against a real Claude.

This is why #20149 — which added `claude` to `ESCAPE_ALSO_NAVIGATES_AGENT_TYPES` deferring to "the
provider's own hook" — left an escape-interrupted row on **Working** until the 30-minute staleness
decay. Its fix for #13547 was correct; the fallback it deferred to does not exist.

## Versions

| Thing              | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| `claude --version` | `2.1.236`                                                     |
| Captured           | 2026-09-17, macOS, 120x40 PTY                                 |
| Account / model    | Team subscription, Opus 5 (1M context); scrubbed in the files |

## The marker

```
  ⎿ Interrupted · What should Claude do instead?
```

Claude places those words with absolute column moves (`Interrupted\x1b[18G·\x1b[20GWhat…`) and
separates `⎿` from the phrase with a non-breaking space, so neither the spacing nor — on a narrow
pane — the line break is fixed. The rule collapses whitespace before matching, and matches the
`⎿` prefix rather than the bare phrase: an agent quoting the sentence in its own output would
otherwise settle its own row.

## What the captures are

| Fixture                              | What it is                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `claude-interrupt-during-tool.txt`   | Escape during `Bash(sleep 120)`. Marker replaces the tool result.                      |
| `claude-interrupt-during-text.txt`   | Escape while prose streams, no tool in flight. Marker follows the truncated text.      |
| `claude-interrupt-at-permission.txt` | Escape while a `Do you want to proceed?` prompt owns the screen.                       |
| `claude-btw-composer-dismissed.txt`  | **Negative.** Escape closes the slash-command menu; `⎿ Running…` and the spinner stay. |
| `claude-turn-completed-normally.txt` | **Negative control.** A turn that ended on its own.                                    |

### How they were driven

Each ran in an empty, already-trusted `/tmp` directory with
`--settings '{"permissions":{"allow":["Bash(sleep:*)"]}}'`, so no capture depends on the operator's
own config. The recorder's `--send` offsets, with `--cols 120 --rows 40`:

| Fixture                   | Sends                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `during-tool`             | `14000:Run this exact bash command and nothing else: sleep 120`, `17000:\r`, `50000:\e`                        |
| `during-text`             | `14000:Write a 600 word essay about the history of the bicycle. Do not use any tools.`, `17000:\r`, `30000:\e` |
| `at-permission`           | as above with `curl -sS https://example.com`, `45000:\e`, plus `--permission-mode default`                     |
| `btw-composer-dismissed`  | `sleep 120` as above, then `50000:/btw`, `58000:\e`                                                            |
| `turn-completed-normally` | `14000:Reply with exactly the word: hi`, `17000:\r`                                                            |

`Aurélien` → `Operator` and `Enpal` → `Astra` were redacted by hand, same character count. The
`--send` and scrub traps these captures hit are written up generally in
[`agent-pty-transcript-capture.md`](./agent-pty-transcript-capture.md).

## The derived tail cannot see any of this

A Claude pane's derived tail (`buildPreview` over `pty.tailBuffer`) is **empty** for all five
transcripts, while the same harness produces a populated tail for an Antigravity fixture and for
plain text. Claude repaints in place, so every readiness-style rule over the preview is blind to it.

The rule therefore reads `readTerminal(handle, { screen: true })` — the emulator projection of the
visible grid. That path also excludes the composer draft, so text the user typed but never sent is
not mistaken for agent output. Note Claude does **not** use the alternate screen
(`isAlternateScreen` is false throughout), so `visibleSnapshotPreview`'s alternate-screen shortcut
does not apply and the screen read must be asked for explicitly.

## Escape does not mean one thing

Two shapes, both plain Escape on a `working` Claude row, distinguished only by what the pane then
paints. This is why the keystroke arms and the screen confirms, rather than either alone deciding:

- **Interrupts the turn:** Escape during a tool call, during streaming text, at a permission
  prompt — and, unexpectedly, Escape with unsent text sitting in the composer (the text survives,
  the turn does not).
- **Does not interrupt:** Escape while the slash-command menu is open. This is the #13547 case, and
  it is the only one found. A capture that types plain text mid-turn and presses Escape does _not_
  reproduce it.

## What a paired client sees

No wire change: `AgentInterruptInferenceRequest` is unchanged and the request never crosses the
client/host boundary. Rule 3 of
[`remote-wire-compatibility.md`](./remote-wire-compatibility.md) still applies — this changes what
the host _publishes_, so an old client starts receiving `done{interrupted}` rows on panes that
previously stayed `working`. That row shape already exists (Ctrl+C produces it today), so nothing
needs negotiating.

## What could not be captured, and why

- **A remote (SSH) pane.** A transcript recorded locally is not evidence about what a remote agent
  prints, and the confirmation must resolve on the execution host. Direct-SSH panes reach no
  interrupt inference at all today (`pty-transport.ts` omits the input ack when a `connectionId` is
  present), so this is a separate change with its own evidence.
- **Windows and Linux.** Same CLI, but wrapping and glyph width are platform-visible and the rule
  has only been measured on macOS.
- **Other agents.** `omp`, `pi` and `prime-agent` are in the same navigation-escape set and have no
  captured screen. The rule is keyed to `claude` only; each of the others needs its own capture
  before it can be added.
