export type EditorSaveNormalizationSettings = {
  /**
   * On save, end files with one line break and trim trailing whitespace outside Markdown.
   * Defaults on with no settings control; absent (as in bare test stores) means off.
   */
  editorNormalizeOnSave?: boolean
}
