import type { Tab } from './tab-types'
import type { TerminalTab } from './terminal-tab-types'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'

export function resolveTerminalTabTitle(
  tab: Pick<
    TerminalTab,
    'quickCommandLabel' | 'aiVaultTitle' | 'rollingTitle' | 'generatedTitle' | 'title'
  > & {
    customTitle?: string | null
  },
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveTitle = tab.title?.trim() ?? ''
  return (
    tab.customTitle?.trim() ||
    tab.quickCommandLabel?.trim() ||
    // Why: Claude's session name and OpenCode's `OC |` title are minted once from the
    // opening prompt, so below them the rolling title would never surface.
    tab.rollingTitle?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : '') ||
    tab.aiVaultTitle?.title.trim() ||
    (generatedTitlesEnabled ? tab.generatedTitle?.trim() : '') ||
    liveTitle ||
    fallback
  )
}

export function resolveUnifiedTabLabel(
  tab:
    | Pick<
        Tab,
        | 'customLabel'
        | 'quickCommandLabel'
        | 'aiVaultTitle'
        | 'rollingLabel'
        | 'generatedLabel'
        | 'label'
      >
    | undefined,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveLabel = tab?.label?.trim() ?? ''
  return (
    tab?.customLabel?.trim() ||
    tab?.quickCommandLabel?.trim() ||
    tab?.rollingLabel?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveLabel) ? liveLabel : '') ||
    tab?.aiVaultTitle?.title.trim() ||
    (generatedTitlesEnabled ? tab?.generatedLabel?.trim() : '') ||
    liveLabel ||
    fallback
  )
}
