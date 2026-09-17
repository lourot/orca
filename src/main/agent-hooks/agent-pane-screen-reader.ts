/**
 * Lets the hook server read what a pane is currently painting.
 *
 * The hook server holds no runtime reference by design — the runtime is the status producer, the
 * server the store — so the one read it needs arrives as this function, wired per host.
 */
export type AgentPaneScreenReader = (paneKey: string) => Promise<readonly string[] | null>

/** The slice of the runtime a screen read needs; structural, so this module stays a leaf. */
type PaneScreenRuntime = {
  resolveTerminalPane: (paneKey: string) => { handle: string }
  readTerminal: (
    handle: string,
    opts: { screen?: boolean }
  ) => Promise<{ source?: string; tail: string[] }>
}

/**
 * Reads the pane's rendered grid, not its output stream.
 *
 * A full-screen TUI repaints in place, so its raw PTY tail can be empty while the pane is visibly
 * nonblank — a Claude pane's derived tail is empty in every captured transcript. `screen: true`
 * takes the emulator projection instead, and excludes the composer draft, so text the user typed
 * but never sent is not mistaken for agent output.
 */
export function createAgentPaneScreenReader(runtime: PaneScreenRuntime): AgentPaneScreenReader {
  return async (paneKey) => {
    try {
      const pane = runtime.resolveTerminalPane(paneKey)
      const read = await runtime.readTerminal(pane.handle, { screen: true })
      return read.source === 'screen' ? read.tail : null
    } catch {
      // A pane that closed, moved host, or was never ours reads as "no screen", never as "clean".
      return null
    }
  }
}
