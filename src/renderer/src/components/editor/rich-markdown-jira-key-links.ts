import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  findJiraKeyTextLinks,
  type JiraKeyLinkConfig
} from '../../../../shared/jira/jira-key-text-links'

export const JIRA_KEY_LINK_HREF_ATTRIBUTE = 'data-jira-key-href'

/** Dispatch with `tr.setMeta(richMarkdownJiraKeyLinksPluginKey, true)` to rebuild after a settings change. */
export const richMarkdownJiraKeyLinksPluginKey = new PluginKey<DecorationSet>(
  'richMarkdownJiraKeyLinks'
)

function buildDecorations(doc: ProseMirrorNode, config: JiraKeyLinkConfig | null): DecorationSet {
  if (!config) {
    return DecorationSet.empty
  }
  const decorations: Decoration[] = []
  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text || parent?.type.spec.code) {
      return
    }
    if (node.marks.some((mark) => mark.type.name === 'link' || mark.type.spec.code)) {
      return
    }
    for (const link of findJiraKeyTextLinks(node.text, config)) {
      decorations.push(
        Decoration.inline(pos + link.start, pos + link.end, {
          nodeName: 'a',
          class: 'rich-markdown-jira-key-link',
          [JIRA_KEY_LINK_HREF_ATTRIBUTE]: link.url
        })
      )
    }
  })
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations)
}

/** Shows configured Jira issue keys as links without changing the document or its saved Markdown. */
export function createRichMarkdownJiraKeyLinks(
  getConfig: () => JiraKeyLinkConfig | null
): Extension {
  return Extension.create({
    name: 'richMarkdownJiraKeyLinks',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: richMarkdownJiraKeyLinksPluginKey,
          state: {
            init: (_config, state) => buildDecorations(state.doc, getConfig()),
            apply: (tr, decorations) =>
              tr.docChanged || tr.getMeta(richMarkdownJiraKeyLinksPluginKey)
                ? buildDecorations(tr.doc, getConfig())
                : decorations
          },
          props: {
            decorations: (state) => richMarkdownJiraKeyLinksPluginKey.getState(state)
          }
        })
      ]
    }
  })
}
