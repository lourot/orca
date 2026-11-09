import { useEffect, useMemo, useRef } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import {
  createRichMarkdownJiraKeyLinks,
  richMarkdownJiraKeyLinksPluginKey
} from './rich-markdown-jira-key-links'
import { getJiraKeyLinkConfig, useJiraKeyLinkConfig } from '@/lib/jira-key-link-config'
import {
  createRichMarkdownEditorConfig,
  type EditorConfigParams
} from './rich-markdown-editor-config'

export function useRichMarkdownEditorInstance(params: EditorConfigParams): Editor | null {
  const extensions = useMemo(
    () => [
      ...createRichMarkdownExtensions({
        codec: params.codec,
        includePlaceholder: true,
        htmlSuperscriptLinks: true,
        htmlSuperscriptLinkContext: params.htmlSuperscriptLinkContext
      }),
      createRichMarkdownJiraKeyLinks(getJiraKeyLinkConfig)
    ],
    [params.codec, params.htmlSuperscriptLinkContext]
  )
  const editor = useEditor(
    useMemo(
      () => ({
        extensions,
        ...createRichMarkdownEditorConfig(params)
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(params)
    ),
    // Empty dependencies update Tiptap options without recreating the editor, preserving selection/history instead of reparsing content.
    []
  )
  const jiraKeyLinkConfig = useJiraKeyLinkConfig()
  // The plugin reads the config at init, so only a later settings change needs a rebuild.
  const renderedJiraKeyLinkConfig = useRef(jiraKeyLinkConfig)
  useEffect(() => {
    if (renderedJiraKeyLinkConfig.current === jiraKeyLinkConfig) {
      return
    }
    renderedJiraKeyLinkConfig.current = jiraKeyLinkConfig
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(richMarkdownJiraKeyLinksPluginKey, true))
    }
  }, [editor, jiraKeyLinkConfig])
  params.editorRef.current = editor ?? null
  return editor
}
