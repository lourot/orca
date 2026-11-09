import type { OnMount } from '@monaco-editor/react'
import type { IDisposable, languages } from 'monaco-editor'
import { findJiraKeyTextLinks } from '../../../../shared/jira/jira-key-text-links'
import { getJiraKeyLinkConfig } from '@/lib/jira-key-link-config'

type MonacoApi = Parameters<OnMount>[1]

let provider: IDisposable | null = null
let providerMonaco: MonacoApi = null

/** Registers one Markdown link provider per Monaco instance that turns configured Jira keys into links. */
export function ensureMarkdownJiraKeyLinkProvider(monaco: MonacoApi): void {
  if (!monaco || (provider && providerMonaco === monaco)) {
    return
  }
  provider?.dispose()
  providerMonaco = monaco
  provider = monaco.languages.registerLinkProvider('markdown', {
    provideLinks(model) {
      const config = getJiraKeyLinkConfig()
      const links: languages.ILink[] = []
      if (!config) {
        return { links }
      }
      for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
        for (const link of findJiraKeyTextLinks(model.getLineContent(lineNumber), config)) {
          links.push({
            range: new monaco.Range(lineNumber, link.start + 1, lineNumber, link.end + 1),
            url: link.url
          })
        }
      }
      return { links }
    }
  })
}
