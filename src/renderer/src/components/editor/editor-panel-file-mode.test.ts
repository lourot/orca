import { describe, it, expect } from 'vitest'
import { canAnnotateEditorSurface } from './editor-panel-file-mode'

describe('canAnnotateEditorSurface', () => {
  // Why: the gate used to be `language === 'markdown'`, which silently blocked
  // notes on every other text file. Nothing else would catch that coming back.
  it('allows any text language and blocks only a notebook source view', () => {
    expect(canAnnotateEditorSurface({ annotationsEnabled: true, isNotebook: false })).toBe(true)
    expect(canAnnotateEditorSurface({ annotationsEnabled: true, isNotebook: true })).toBe(false)
  })

  it('stays off when the caller disabled annotations', () => {
    expect(canAnnotateEditorSurface({ annotationsEnabled: false, isNotebook: false })).toBe(false)
  })
})
