import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'

export function getRollingAgentTitleTitle(): string {
  return translate(
    'auto.components.settings.rolling-agent-title-copy.title',
    'Keep agent titles up to date'
  )
}

export function getRollingAgentTitleDescription(): string {
  return translate(
    'auto.components.settings.rolling-agent-title-copy.description',
    'Rename agent tabs and sidebar rows from the latest finished turn, using the Branch name model. Costs one model call per turn, at most one every two minutes. Manual renames always win.'
  )
}

export function getRollingAgentTitleSearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.agents.search.96ba2373b6', fallback: 'agent' },
    { key: 'auto.components.settings.agents.search.be7ea3553b', fallback: 'tab' },
    { key: 'auto.components.settings.agents.search.6956646a1e', fallback: 'title' },
    { key: 'auto.components.settings.agents.search.966890236d', fallback: 'name' },
    { key: 'auto.components.settings.agents.search.5784ae8c43', fallback: 'rename' },
    { key: 'auto.components.settings.agents.search.a79d266f71', fallback: 'session' },
    {
      key: 'auto.components.settings.rolling-agent-title-copy.search.rolling',
      fallback: 'rolling'
    },
    {
      key: 'auto.components.settings.rolling-agent-title-copy.search.conversation',
      fallback: 'conversation'
    },
    {
      key: 'auto.components.settings.rolling-agent-title-copy.search.summary',
      fallback: 'summary'
    },
    {
      key: 'auto.components.settings.rolling-agent-title-copy.search.upToDate',
      fallback: 'up to date'
    }
  ])
}
