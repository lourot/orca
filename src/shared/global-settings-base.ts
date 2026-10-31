import type { BacklogNewTaskSettings } from './backlog-new-task-settings'
import type { BrowserExtensionGlobalSettings } from './browser-extension-settings'
import type { ClaudeAgentViewSettings } from './claude-agent-view'
import type { BrowserLinkOpeningSettings } from './browser-link-opening-settings'
import type { ClaudeAccountSwitchSettings } from './claude-account-switch-settings'
import type { ExternalConversationSettings } from './external-conversation-settings'
import type { NativeChatGlobalSettings } from './native-chat/native-chat-appearance-settings'
import type { PluginAppearanceSettings } from './plugin-appearance-settings-types'
import type { PluginFileTypeSuggestionSettings } from './plugins/contributions/plugin-file-type'
import type { PluginUpdatePolicySettings } from './plugins/catalog/plugin-update-policy'
import type { PluginSystemSettings } from './plugins/plugin-system-settings'
import type { WorktreeDeletionPreferences } from './worktree-deletion-preferences'
import type { AgentPermissionGlobalSettings } from './tui-agent-permission-choice'
import type { OrchestrationHeartbeatSettings } from './orchestration-heartbeat'
import type { RollingAgentTitleSettings } from './tab-types'
import type { EditorSaveNormalizationSettings } from './editor-save-normalization-settings'
import type { AgentMessageLogSettings } from './agent-message-log-contract'
import type { JiraKeyLinkSettings } from './jira/jira-key-text-links'

/** Settings groups owned by their feature modules and composed into GlobalSettings. */
export type GlobalSettingsBase = ClaudeAgentViewSettings &
  NativeChatGlobalSettings &
  WorktreeDeletionPreferences &
  ClaudeAccountSwitchSettings &
  AgentPermissionGlobalSettings &
  ExternalConversationSettings &
  BrowserLinkOpeningSettings &
  OrchestrationHeartbeatSettings &
  BrowserExtensionGlobalSettings &
  PluginAppearanceSettings &
  PluginFileTypeSuggestionSettings &
  PluginUpdatePolicySettings &
  PluginSystemSettings &
  RollingAgentTitleSettings &
  EditorSaveNormalizationSettings &
  BacklogNewTaskSettings &
  AgentMessageLogSettings &
  JiraKeyLinkSettings
