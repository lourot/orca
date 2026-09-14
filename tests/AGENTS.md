# Automated App Launches

- Set `ORCA_BACKGROUND_LAUNCH=1` for all tests and agent-launched apps. Use
  [`orca-app.ts`](e2e/helpers/orca-app.ts) / [`orca-restart.ts`](e2e/helpers/orca-restart.ts);
  raw `electron.launch()` calls must pass the env explicitly.
- Keep windows hidden and drive renderers through Playwright CDP. Never reveal windows,
  steal focus, or activate the app on the user's desktop. `@headful` is for tests requiring
  real pixels; it does not authorize foreground activation. Never set `ORCA_E2E_FOREGROUND=1`
  on the desktop.
- Run native-focus and visible-window tests only on an isolated display or CI.
- Rebuild modified launch-policy code before launching; stale wrappers are unsafe.
- Only the [terminal perf](e2e/terminal-perf-presentation.ts) and
  [native IBus](e2e/terminal-native-ibus-window.ts) fixtures, and the guarded
  [native browser image-focus test](e2e/browser-image-link-focus.spec.ts), may explicitly present windows
  on their isolated hosted-CI Xvfb displays. Preserve their guards and keep
  `ORCA_BACKGROUND_LAUNCH=1`; do not generalize these exceptions to other fixtures or
  production launch policy. Background terminal panes stay hidden.
- The browser image-focus test also permits an isolated Docker Xvfb display, with
  `ORCA_E2E_BROWSER_NATIVE_XVFB=1`; desktop runs must skip it.

# Unset `ELECTRON_RENDERER_URL` Before Running Tests

A shell that inherited `ELECTRON_RENDERER_URL` from a running `electron-vite dev` makes tests
pass against code you are not editing. Both failure modes are silent:

- **E2E loads the wrong renderer.** `createMainWindow.ts:42` prefers `loadURL(ELECTRON_RENDERER_URL)`
  over `loadFile(out/renderer/index.html)` whenever it is set and `is.dev`. The helpers pass the
  caller's env straight through and force `NODE_ENV=development`, so the app under test renders
  whatever is on `localhost:5173`. In a worktree that dev server usually belongs to a _different
  checkout_, so the suite greens against unmodified code and `mainPath` pointing at your own
  `out/main` does not save you.
- **Unit tests fail for no visible reason.** `clipboard-ipc-handlers.ts:311` authorizes IPC senders
  by comparing origins against the same variable, so the clipboard suite reports 20 failures
  (`Unauthorized clipboard IPC sender`) that all disappear once it is unset.

Run with `env -u ELECTRON_RENDERER_URL` whenever a dev server may be up. To confirm which renderer
an e2e run actually loaded, read `location.href` in the page: it must be a `file://` URL under the
checkout you are testing, not `http://localhost:5173/`.
