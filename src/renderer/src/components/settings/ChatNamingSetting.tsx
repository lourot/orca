import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { SourceControlAiSettingsPatch } from '../../../../shared/source-control-ai-types'
import { translate } from '@/i18n/i18n'
import { AiTextActionRecipeSetting } from './AiTextActionRecipeSetting'
import { getChatNamingSearchEntry } from './chat-naming-search'

type ChatNamingSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  writeSourceControlAiSettings: (patch: SourceControlAiSettingsPatch) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  forceVisible?: boolean
}

export function ChatNamingSetting({
  settings,
  updateSettings,
  writeSourceControlAiSettings,
  onDirtyChange,
  forceVisible = false
}: ChatNamingSettingProps): React.JSX.Element {
  return (
    <AiTextActionRecipeSetting
      actionId="conversationName"
      sectionId="chat-names"
      searchEntry={getChatNamingSearchEntry()}
      enabled={settings.nativeChatAutoName !== false}
      onEnabledChange={(checked) => void updateSettings({ nativeChatAutoName: checked })}
      enableLabel={translate('settings.chat.names.enable', 'Name chats automatically')}
      saveFailedMessage={translate(
        'settings.chat.names.saveFailed',
        'Could not save chat name settings.'
      )}
      settings={settings}
      writeSourceControlAiSettings={writeSourceControlAiSettings}
      onDirtyChange={onDirtyChange}
      forceVisible={forceVisible}
    />
  )
}
