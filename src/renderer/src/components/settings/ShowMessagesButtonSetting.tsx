import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import type { SettingsSearchEntry } from './settings-search'
import { SettingsSwitchRow } from './SettingsFormControls'

/** Brings back the sidebar's Messages button after it was hidden from its context menu. */
export function ShowMessagesButtonSetting({
  settings,
  updateSettings,
  searchEntry
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  searchEntry: SettingsSearchEntry | undefined
}): React.JSX.Element {
  const label = translate(
    'auto.components.settings.AppearancePane.showMessagesButton',
    'Show Messages Button'
  )
  return (
    <SearchableSetting
      title={label}
      description={searchEntry?.description}
      keywords={searchEntry?.keywords ?? ['messages', 'agents', 'sidebar']}
    >
      <SettingsSwitchRow
        label={label}
        checked={settings.showMessagesButton !== false}
        onChange={() =>
          updateSettings({ showMessagesButton: !(settings.showMessagesButton !== false) })
        }
      />
    </SearchableSetting>
  )
}
