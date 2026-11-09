import { memo, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { PluggableList } from 'unified'
import { MARKDOWN_REMARK_PLUGINS, MARKDOWN_REHYPE_PLUGINS } from './markdown-preview-plugins'
import { markdownPreviewUrlTransform } from './markdown-preview-url-transform'
import { remarkJiraKeyLinks } from './remark-jira-key-links'
import { useJiraKeyLinkConfig } from '@/lib/jira-key-link-config'

// Why: find-state renders must not rebuild the full remark/rehype pipeline.
export const MarkdownPreviewBody = memo(function MarkdownPreviewBody({
  content,
  components
}: {
  content: string
  components: Components
}) {
  const jiraKeyLinkConfig = useJiraKeyLinkConfig()
  const remarkPlugins = useMemo<PluggableList>(
    () =>
      jiraKeyLinkConfig
        ? [...MARKDOWN_REMARK_PLUGINS, [remarkJiraKeyLinks, jiraKeyLinkConfig]]
        : MARKDOWN_REMARK_PLUGINS,
    [jiraKeyLinkConfig]
  )
  return (
    <Markdown
      components={components}
      urlTransform={markdownPreviewUrlTransform}
      remarkPlugins={remarkPlugins}
      rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
    >
      {content}
    </Markdown>
  )
})
