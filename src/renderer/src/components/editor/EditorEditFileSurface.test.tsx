// @vitest-environment happy-dom
import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { FileContent } from './editor-panel-content-types'

const monacoMock = vi.hoisted(() => ({
  latestProps: null as { annotationsEnabled?: boolean } | null
}))

vi.mock('./editor-lazy-views', () => ({
  CsvViewer: () => null,
  ImageViewer: () => null,
  IpynbViewer: () => null,
  MermaidViewer: () => null,
  MonacoEditor: (props: { annotationsEnabled?: boolean }) => {
    monacoMock.latestProps = props
    return <div data-testid="monaco-probe" />
  }
}))

import { EditorEditFileSurface } from './EditorEditFileSurface'

function openFile(relativePath: string): OpenFile {
  return {
    id: 'file-1',
    filePath: `/repo/${relativePath}`,
    relativePath,
    worktreeId: 'repo::/repo',
    language: 'cpp',
    isDirty: false,
    mode: 'edit'
  } as OpenFile
}

const FILE_CONTENT: FileContent = { content: 'int main() {}' } as FileContent

async function renderSurface(
  root: Root,
  overrides: { relativePath: string; isMarkdown: boolean; isNotebook: boolean }
): Promise<void> {
  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <EditorEditFileSurface
          activeFile={openFile(overrides.relativePath)}
          viewStateScopeId="file-1"
          editorViewStateKey="file-1:edit"
          diffViewStateKey="file-1:diff"
          pdfViewStateKey="file-1:pdf"
          fileContent={FILE_CONTENT}
          diffContent={undefined}
          editBuffer={undefined}
          activeConflictEntry={null}
          monacoLanguage="cpp"
          isMarkdown={overrides.isMarkdown}
          isMermaid={false}
          isCsv={false}
          isNotebook={overrides.isNotebook}
          mdViewMode="source"
          inlineMarkdownRenderState={null}
          isChangesMode={false}
          sideBySide={false}
          showMarkdownTableOfContents={false}
          showMarkdownFrontmatter={false}
          onCloseMarkdownTableOfContents={vi.fn()}
          markdownAnnotationsEnabled={true}
          pendingEditorReveal={null}
          markdownDocuments={{ markdownDocuments: [], mdSave: vi.fn() } as never}
          getConflictNavigation={vi.fn()}
          getMarkdownSourceLineOffset={vi.fn()}
          handleContentChange={vi.fn()}
          handleDirtyStateHint={vi.fn()}
          handleSave={vi.fn()}
          reloadContent={vi.fn()}
        />
      </Suspense>
    )
  })
  await vi.waitFor(() => expect(monacoMock.latestProps).not.toBeNull())
}

describe('EditorEditFileSurface annotation enablement', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
    monacoMock.latestProps = null
  })

  // Why: the affordance used to be markdown-only, so a .cpp file silently had no
  // gutter "+". Nothing else fails if that gate comes back.
  it('enables review notes on a non-markdown text file', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await renderSurface(root, {
      relativePath: 'src/main.cpp',
      isMarkdown: false,
      isNotebook: false
    })

    expect(monacoMock.latestProps?.annotationsEnabled).toBe(true)
  })

  it('leaves them off for a notebook source view', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await renderSurface(root, {
      relativePath: 'notes.ipynb',
      isMarkdown: false,
      isNotebook: true
    })

    expect(monacoMock.latestProps?.annotationsEnabled).toBe(false)
  })
})
