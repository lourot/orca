# Capturing an agent PTY transcript

Orca's readiness and blocked-prompt rules are text rules over what an agent CLI paints on a
terminal. They are only as good as the screens they were written against. This is how to record
one, byte for byte, so a rule can be pinned to evidence instead of to a remembered screen.

Related: [`antigravity-readiness-evidence.md`](./antigravity-readiness-evidence.md) names the
specific Antigravity transcripts that are still missing and what each one decides.

## The recorder

```
node config/scripts/capture-agent-pty-transcript.mjs --name <fixture-name> [options] -- <command> [args...]
```

It allocates a real PTY, spawns the agent inside it, mirrors the session to your terminal so you
can drive it by hand, and appends every byte it receives to
`src/main/runtime/__fixtures__/<fixture-name>.txt`. It does not strip escapes, fold `\r`, rewrap
lines, or normalise anything — the file is what the terminal received.

- **Ending a capture:** press <kbd>Ctrl</kbd>+<kbd>]</kbd>. The recorder consumes that key and
  never forwards it, which is the only way to end a capture _while a dialog still owns the
  screen_. Quitting the agent instead would first dismiss the dialog you came to record.
- `--cols N --rows M` pin the PTY size (default: your terminal's). Wrapping is part of the
  evidence, so record the size — the sidecar does it for you.
- `--duration S` stops unattended after S seconds, for a screen that needs no interaction.
- `--send "<ms>:<text>"` types into the PTY at a fixed offset, repeatable, with `\r` `\n` `\t` `\e`
  escapes. A dialog capture has to be driven, and an unattended run (CI, or an agent) has no TTY to
  type into; the keystrokes ride the same PTY a human's would. For example, the committed
  `antigravity-dialog-model-picker.txt` was recorded with
  `--duration 24 --send "14000:/model" --send "16000:\r"`, which leaves the picker owning the
  screen when the capture stops.
- `--note "<text>"` records the account type, plan, model and CLI version in the sidecar.
- `--out <path>` writes outside the fixture directory (use it for a first dry run).

**Send the prompt and its Enter as two `--send`s.** A long line and its `\r` delivered in one chunk
reads as a paste, so the text lands in the composer and the turn never starts — and the capture
looks like the agent ignored you. `--send "14000:<prompt>" --send "17000:\r"`.

**Drive a dialog you cannot reach, rather than assuming it appears.** A permission prompt, a trust
dialog or a menu may be auto-answered by the operator's own mode (Claude's `auto mode` silently
allows commands that would otherwise prompt; `--permission-mode default` restores the prompt).
Capture the state once with `--out /tmp/...` and no keystroke first, confirm the dialog is really on
screen, and only then record the fixture that acts on it. Three of five fixtures in one session
captured the wrong state on the first attempt, each looking plausible.

Each capture also writes `<fixture-name>.meta.json` with the timestamp, platform, command,
PTY size, note and exit code. Commit it with the transcript; the version and account type behind
a screen are not recoverable from the bytes.

**Prerequisite:** `node-pty` must be built for plain Node:

```
node config/scripts/ensure-native-runtime.mjs --runtime=node
```

Orca itself does not need to be running, and the recorder never touches Orca state.

### Platform notes

- **macOS / Linux:** nothing special. `TERM=xterm-256color` is set for the child.
- **Windows:** run it from Windows Terminal / PowerShell, not a Git Bash (MSYS) pane — MSYS
  rewrites arguments that start with `/`, which mangles the `cmd.exe /c` hand-off. A `.cmd` or
  `.bat` agent shim cannot be spawned by node-pty directly, so the recorder routes those through
  `cmd.exe` for you.
- **WSL:** capture _inside_ the distro (run the recorder from the distro's checkout). Recording
  `wsl.exe` from the Windows side adds the login-shell banner to the transcript.
- **SSH:** record on the execution host. A transcript recorded locally is not evidence about what
  a remote agent prints.

## Privacy: scrub before committing

A live agent screen routinely contains things that must not enter git history:

| Scrub                                                                  | Why                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Account email / sign-in identifier                                     | The account row on a ready screen prints it verbatim |
| Org, tenant or team name                                               | Identifies a customer                                |
| Machine hostname and OS username                                       | Appear in prompts, paths and the OSC title           |
| Absolute home paths (`/Users/<you>`, `C:\Users\<you>`)                 | Contain the username                                 |
| JWTs, `AIza…` keys, `1//…` refresh tokens, `Bearer …`, `sk-…`, `ghp_…` | Live credentials; a sign-in screen can echo one      |
| Private repo, branch and ticket names                                  | Leak roadmap detail                                  |
| Anything you pasted into the agent during the capture                  | You typed it; it is in the transcript                |

The recorder scans the file as soon as the capture ends and prints every hit with a line and
column. To scrub:

```
node config/scripts/capture-agent-pty-transcript.mjs --scan src/main/runtime/__fixtures__/<name>.txt --redact
```

Redaction replaces each finding with a **same-length** placeholder (`u…u@example.com`, `XXXX…`).
Length matters: a transcript's value is its exact wrapping and column alignment, and a shorter
replacement reflows the screen and destroys the evidence.

### Hand-scrubbing: binary mode, or you destroy the transcript

The scanner matches shapes, so a first name, an org or a project name has to be replaced by hand.
**Do it in binary.** A text-mode read/write translates every bare `\r` to `\n` — and a bare `\r` is
how a TUI repaints, so the file survives as valid UTF-8 that renders as garbage. Nothing warns you:
the scan still says `clean`, the diff still looks like a diff, and a fixture is not in git yet, so
there is no copy to restore.

```python
data = open(path, 'rb').read()            # NOT open(path) — text mode rewrites newlines
assert len(old.decode()) == len(new.decode())
open(path, 'wb').write(data.replace(old, new))
```

Check `data.count(b'\r')` before and after; it must not change. A freshly captured transcript has
hundreds of CRs, so a count near zero means the file has already been through a text-mode rewrite.

### Verify it is gone

1. `node config/scripts/capture-agent-pty-transcript.mjs --scan src/main/runtime/__fixtures__/<name>.txt`
   must print `clean` and exit `0`. It recognises its own placeholders, so a scrubbed file passes.
2. Grep for the specifics the scanner cannot know:
   `rg -n -i -- "$(whoami)|<your-email>|<your-org>|<your-hostname>" src/main/runtime/__fixtures__/<name>.txt`
3. Read it once with escapes visible: `LC_ALL=C cat -v src/main/runtime/__fixtures__/<name>.txt`.
   The scanner matches shapes; only a human catches a project name.
4. Check the sidecar too — `--note` text is free-form and is committed.

`config/scripts/pty-transcript-secret-scan.test.mjs` re-scans every committed
`__fixtures__/*.txt`, so a transcript that skips step 1 fails the suite.

## Consuming a transcript in a test

Feed the raw bytes through the runtime rather than into a matcher directly: escape handling,
tail retention and title tracking all live in `onPtyData`, and a rule tested on pre-normalised
text is tested on something no pane ever sees.

**Replay at the size the capture ran at.** Pass `createTranscriptPane`'s `size` from the fixture's
own `<name>.meta.json`; without it the emulator defaults to 80x24 and a 120-column capture rewraps
into text no terminal ever showed — words spliced mid-line (`⏺ RecRunnbula (3s …`) that read like a
detector bug rather than a harness one.

**Some agents have no usable tail at all.** A TUI that repaints in place can leave the derived tail
(`buildPreview` over `pty.tailBuffer`) empty while the pane is visibly full — that is every captured
Claude transcript. Read `readTerminal(handle, { screen: true })` for those, and before believing an
empty tail is a finding, run a known-positive control through the same harness: an Antigravity
fixture and a plain `'hello\n'` both produce a populated tail.

`src/main/runtime/agent-transcript-pane-test-harness.ts` builds the pane;
`src/main/runtime/terminal-interactive-wait-visibility.test.ts` (cursor-agent) and
`src/main/runtime/antigravity-readiness-transcripts.test.ts` (Antigravity) are the two consumers.

## Worked example: the Antigravity captures

The six committed `antigravity-*.txt` fixtures were recorded this way on macOS against
`agy` 1.1.25. Two points generalise:

- **Reach a state without mutating the operator's config.** The ready-screen captures ran in a
  directory the CLI already trusted, so no trust answer was written. Where a dialog could only be
  reached by signing the operator out or deleting their settings, it was left uncaptured and
  recorded as such rather than forced.
- **An environment variable is a legitimate capture knob** where a setting is not.
  `AGY_CLI_HIDE_ACCOUNT_INFO=1` produced a second ready screen with no account row, which is
  evidence no amount of reasoning about the first screen could have supplied. It changes nothing
  on disk.

## Known gap in the existing captures

The three `cursor-agent-*.txt` fixtures contain **no escape bytes and no carriage returns**.
Whatever produced them went through a renderer and a clipboard, so they preserve wording and
box-drawing glyphs but not the caret, the cursor moves, the repaints, or whether the CLI uses the
alternate screen buffer. They are good enough for the wording-based rules built on them and are
not evidence for anything else. New captures made with this recorder keep those bytes; the
Antigravity scaffold asserts their presence so a pasted screen cannot pass as a capture.
