import type React from 'react'
import { useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  normalizeJiraKeyLinkBaseUrl,
  normalizeJiraProjectKeys
} from '../../../../shared/jira/jira-key-text-links'
import { translate } from '@/i18n/i18n'
import { Input } from '../ui/input'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow } from './SettingsFormControls'

type JiraKeyLinksSettingProps = {
  settings: Pick<GlobalSettings, 'jiraKeyLinks'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export const JIRA_KEY_LINKS_KEYWORDS = ['jira', 'issue key', 'link', 'markdown', 'ticket']

export function getJiraKeyLinksTitle(): string {
  return translate('auto.components.settings.JiraKeyLinksSetting.title', 'Jira Issue Key Links')
}

export function getJiraKeyLinksDescription(): string {
  return translate(
    'auto.components.settings.JiraKeyLinksSetting.description',
    'Turn issue keys such as PROJ-123 into links to your Jira site in Markdown files: source, rich and preview. Keys inside URLs stay as they are.'
  )
}

function formatProjectKeys(keys: readonly string[] | undefined): string {
  return (keys ?? []).join(', ')
}

/** Enter commits like blur; committing only then keeps a half-typed URL out of the setting. */
function commitOnEnter(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') {
    event.currentTarget.blur()
  }
}

export function JiraKeyLinksSetting({
  settings,
  updateSettings
}: JiraKeyLinksSettingProps): React.JSX.Element {
  const saved = settings.jiraKeyLinks ?? { baseUrl: '', projectKeys: [] }
  const savedBaseUrl = saved.baseUrl
  const savedProjectKeys = formatProjectKeys(saved.projectKeys)
  const [baseUrlDraft, setBaseUrlDraft] = useState(savedBaseUrl)
  const [projectKeysDraft, setProjectKeysDraft] = useState(savedProjectKeys)
  const baseUrlInvalid =
    baseUrlDraft.trim() !== '' && normalizeJiraKeyLinkBaseUrl(baseUrlDraft) === null
  const title = getJiraKeyLinksTitle()
  const description = getJiraKeyLinksDescription()

  const commitBaseUrl = (): void => {
    const trimmed = baseUrlDraft.trim()
    const next = trimmed === '' ? '' : normalizeJiraKeyLinkBaseUrl(trimmed)
    if (next === null) {
      return
    }
    setBaseUrlDraft(next)
    if (next !== savedBaseUrl) {
      updateSettings({ jiraKeyLinks: { ...saved, baseUrl: next } })
    }
  }

  const commitProjectKeys = (): void => {
    const next = normalizeJiraProjectKeys(projectKeysDraft.split(/[\s,]+/))
    setProjectKeysDraft(formatProjectKeys(next))
    if (formatProjectKeys(next) !== savedProjectKeys) {
      updateSettings({ jiraKeyLinks: { ...saved, projectKeys: next } })
    }
  }

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={JIRA_KEY_LINKS_KEYWORDS}
      className="max-w-none"
    >
      <SettingsRow label={title} description={description} alignTop control={null} />
      <div className="grid gap-2 pb-3 sm:grid-cols-2">
        <Input
          type="url"
          value={baseUrlDraft}
          placeholder={translate(
            'auto.components.settings.JiraKeyLinksSetting.baseUrlPlaceholder',
            'https://your-site.atlassian.net'
          )}
          aria-label={translate(
            'auto.components.settings.JiraKeyLinksSetting.baseUrlLabel',
            'Jira site URL'
          )}
          aria-invalid={baseUrlInvalid}
          onChange={(event) => setBaseUrlDraft(event.target.value)}
          onBlur={commitBaseUrl}
          onKeyDown={commitOnEnter}
        />
        <Input
          value={projectKeysDraft}
          placeholder={translate(
            'auto.components.settings.JiraKeyLinksSetting.projectKeysPlaceholder',
            'PROJ, OPS'
          )}
          aria-label={translate(
            'auto.components.settings.JiraKeyLinksSetting.projectKeysLabel',
            'Jira project keys, separated by commas'
          )}
          onChange={(event) => setProjectKeysDraft(event.target.value)}
          onBlur={commitProjectKeys}
          onKeyDown={commitOnEnter}
        />
      </div>
    </SearchableSetting>
  )
}
