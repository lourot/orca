import type {
  BrowserResolveAnnotationAnchorsArgs,
  BrowserResolvedAnnotationAnchor
} from '../../shared/browser-annotation-anchor-resolution'

export type BrowserAnnotationAnchorApi = {
  /** Measures saved notes' elements in the current document; unmatched notes are left out. */
  resolveAnnotationAnchors: (
    args: BrowserResolveAnnotationAnchorsArgs
  ) => Promise<BrowserResolvedAnnotationAnchor[]>
  /** Text selected inside the element picked for the open note; null when there is none. */
  readGrabSelectedText: (args: { browserPageId: string }) => Promise<string | null>
}
