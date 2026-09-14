# Keep Automated Runs Out of the Foreground

Tests and agent-driven app launches share the developer's machine. They may use it; they must never
take the foreground — no window raised over the editor, no focus stolen, no Dock tile churn.

`src/main/window/foreground-activation-policy.ts` enforces this in the main process. It is on
whenever `ORCA_E2E_HEADLESS=1`, `ORCA_E2E_HEADFUL=1`, or `ORCA_BACKGROUND_LAUNCH=1`:

- headless / explicit background → the window never reaches the screen (Playwright drives it via CDP)
- headful without explicit background → `showInactive()`, no `app.focus({ steal: true })`, no
  `moveTop()`/always-on-top reinforcement
- macOS headless / explicit background → `accessory` activation policy, so no Dock tile and no menu-bar takeover

Rules when adding tests or scripts:

- Launch through `tests/e2e/helpers/orca-app.ts` (or `orca-restart.ts`) — they already set the env.
- A raw `electron.launch()` outside those helpers must pass `ORCA_BACKGROUND_LAUNCH: '1'`.
- Do not reveal windows in explicit background or headless runs. Only an explicitly headful run
  may call `showInactive()`; never call `show()` or `bringToFront()` in automated background checks.
- Tag a spec `@headful` only when it needs real pixels; it still runs in the background.
- Native-focus tests belong on an isolated display or CI. Do not set `ORCA_E2E_FOREGROUND=1`
  on the user’s desktop; it cannot override explicit background mode.

# Unset `ELECTRON_RENDERER_URL` Before Running Tests

A shell that inherited `ELECTRON_RENDERER_URL` from a running `electron-vite dev` makes tests
pass against code you are not editing. Both failure modes are silent:

- **E2E loads the wrong renderer.** `createMainWindow.ts:39` prefers `loadURL(ELECTRON_RENDERER_URL)`
  over `loadFile(out/renderer/index.html)` whenever it is set and `is.dev`. The helpers pass the
  caller's env straight through and force `NODE_ENV=development`, so the app under test renders
  whatever is on `localhost:5173`. In a worktree that dev server usually belongs to a _different
  checkout_, so the suite greens against unmodified code and `mainPath` pointing at your own
  `out/main` does not save you.
- **Unit tests fail for no visible reason.** `clipboard-ipc-handlers.ts:286` authorizes IPC senders
  by comparing origins against the same variable, so the clipboard suite reports 20 failures
  (`Unauthorized clipboard IPC sender`) that all disappear once it is unset.

Run with `env -u ELECTRON_RENDERER_URL` whenever a dev server may be up. To confirm which renderer
an e2e run actually loaded, read `location.href` in the page: it must be a `file://` URL under the
checkout you are testing, not `http://localhost:5173/`.
