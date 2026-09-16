import { describe, expect, it } from 'vitest'
import { resolveTerminalTabTitle, resolveUnifiedTabLabel } from './tab-title-resolution'

describe('tab title resolution', () => {
  it('uses live terminal titles when generated titles are disabled', () => {
    expect(
      resolveTerminalTabTitle(
        { customTitle: null, generatedTitle: 'Refactor auth', title: 'Claude working' },
        false
      )
    ).toBe('Claude working')
  })

  it('places generated titles between manual and live titles when enabled', () => {
    expect(
      resolveTerminalTabTitle(
        { customTitle: null, generatedTitle: 'Refactor auth', title: 'Claude working' },
        true
      )
    ).toBe('Refactor auth')
    expect(
      resolveTerminalTabTitle(
        { customTitle: 'Payments', generatedTitle: 'Refactor auth', title: 'Claude working' },
        true
      )
    ).toBe('Payments')
  })

  it('uses meaningful native OpenCode session titles before generated titles', () => {
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: null,
          generatedTitle: 'Refactor auth',
          title: 'OC | Native Stable Session'
        },
        true
      )
    ).toBe('OC | Native Stable Session')
  })

  it('keeps generated titles ahead of generic OpenCode titles', () => {
    expect(
      resolveTerminalTabTitle(
        { customTitle: null, generatedTitle: 'Refactor auth', title: 'OpenCode' },
        true
      )
    ).toBe('Refactor auth')
  })

  it('places quick command labels between manual and generated titles', () => {
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: null,
          quickCommandLabel: 'Run tests',
          generatedTitle: 'Refactor auth',
          title: 'pnpm test'
        },
        true
      )
    ).toBe('Run tests')
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: 'Manual label',
          quickCommandLabel: 'Run tests',
          generatedTitle: 'Refactor auth',
          title: 'pnpm test'
        },
        true
      )
    ).toBe('Manual label')
  })

  it('keeps a Codex thread name stable across activity plus project OSC titles', () => {
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: null,
          aiVaultTitle: {
            agent: 'codex',
            sessionId: 'codex-session',
            title: 'Repair provider-native tab titles'
          },
          title: '⠋ albacore'
        },
        false
      )
    ).toBe('Repair provider-native tab titles')
  })

  it('keeps manual and quick-command labels ahead of AI Vault titles', () => {
    const aiVaultTitle = {
      agent: 'claude' as const,
      sessionId: 'claude-session',
      title: 'Claude conversation'
    }
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: 'Manual label',
          quickCommandLabel: 'Run tests',
          aiVaultTitle,
          title: 'claude working'
        },
        false
      )
    ).toBe('Manual label')
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: null,
          quickCommandLabel: 'Run tests',
          aiVaultTitle,
          title: 'claude working'
        },
        false
      )
    ).toBe('Run tests')
  })

  it('keeps OpenCode native and Orca-generated title behavior intact', () => {
    const aiVaultTitle = {
      agent: 'codex' as const,
      sessionId: 'codex-session',
      title: 'Codex conversation'
    }
    expect(
      resolveTerminalTabTitle(
        {
          customTitle: null,
          aiVaultTitle,
          generatedTitle: 'Orca generated',
          title: 'OC | OpenCode native'
        },
        true
      )
    ).toBe('OC | OpenCode native')
    expect(
      resolveTerminalTabTitle(
        { customTitle: null, generatedTitle: 'Orca generated', title: '⠋ albacore' },
        true
      )
    ).toBe('Orca generated')
  })

  it('ranks the rolling agent title above provider and generated titles', () => {
    const base = {
      customTitle: null,
      quickCommandLabel: null,
      aiVaultTitle: { agent: 'claude' as const, sessionId: 's1', title: 'Provider title' },
      rollingTitle: 'Rolling now',
      generatedTitle: 'Generated once',
      title: 'claude working'
    }
    expect({
      outranksProviderAndGenerated: resolveTerminalTabTitle(base, true),
      losesToManualRename: resolveTerminalTabTitle({ ...base, customTitle: 'Manual' }, true),
      losesToQuickCommand: resolveTerminalTabTitle(
        { ...base, quickCommandLabel: 'Run tests' },
        true
      ),
      losesToOpenCodeLiveTitle: resolveTerminalTabTitle(
        { ...base, title: 'OC | Native Stable Session' },
        true
      ),
      skippedWhenBlank: resolveTerminalTabTitle({ ...base, rollingTitle: '   ' }, true),
      // Has its own setting, so the generated-title switch must not gate it.
      ignoresGeneratedTitlesDisabled: resolveTerminalTabTitle(base, false)
    }).toEqual({
      outranksProviderAndGenerated: 'Rolling now',
      losesToManualRename: 'Manual',
      losesToQuickCommand: 'Run tests',
      losesToOpenCodeLiveTitle: 'OC | Native Stable Session',
      skippedWhenBlank: 'Provider title',
      ignoresGeneratedTitlesDisabled: 'Rolling now'
    })
  })

  it('ranks the rolling agent label the same way for unified tab labels', () => {
    const base = {
      customLabel: null,
      quickCommandLabel: null,
      aiVaultTitle: { agent: 'claude' as const, sessionId: 's1', title: 'Provider title' },
      rollingLabel: 'Rolling now',
      generatedLabel: 'Generated once',
      label: 'claude working'
    }
    expect({
      outranksProviderAndGenerated: resolveUnifiedTabLabel(base, true),
      losesToManualRename: resolveUnifiedTabLabel({ ...base, customLabel: 'Manual' }, true),
      losesToQuickCommand: resolveUnifiedTabLabel(
        { ...base, quickCommandLabel: 'Run build' },
        true
      ),
      losesToOpenCodeLiveLabel: resolveUnifiedTabLabel(
        { ...base, label: 'OC | Native Stable Session' },
        true
      ),
      skippedWhenBlank: resolveUnifiedTabLabel({ ...base, rollingLabel: '   ' }, true),
      ignoresGeneratedTitlesDisabled: resolveUnifiedTabLabel(base, false)
    }).toEqual({
      outranksProviderAndGenerated: 'Rolling now',
      losesToManualRename: 'Manual',
      losesToQuickCommand: 'Run build',
      losesToOpenCodeLiveLabel: 'OC | Native Stable Session',
      skippedWhenBlank: 'Provider title',
      ignoresGeneratedTitlesDisabled: 'Rolling now'
    })
  })

  it('uses the same priority for unified tab labels', () => {
    expect(
      resolveUnifiedTabLabel(
        { customLabel: null, generatedLabel: 'Fix flaky tests', label: 'Codex working' },
        true
      )
    ).toBe('Fix flaky tests')
  })

  it('uses quick command labels before generated unified labels', () => {
    expect(
      resolveUnifiedTabLabel(
        {
          customLabel: null,
          quickCommandLabel: 'Run build',
          generatedLabel: 'Fix flaky tests',
          label: 'Codex working'
        },
        true
      )
    ).toBe('Run build')
  })

  it('uses meaningful native OpenCode labels before generated unified labels', () => {
    expect(
      resolveUnifiedTabLabel(
        {
          customLabel: null,
          generatedLabel: 'Fix flaky tests',
          label: 'OC | Native Stable Session'
        },
        true
      )
    ).toBe('OC | Native Stable Session')
  })

  it('keeps manual and quick command labels ahead of native OpenCode labels', () => {
    expect(
      resolveUnifiedTabLabel(
        {
          customLabel: 'Manual label',
          quickCommandLabel: 'Run build',
          generatedLabel: 'Fix flaky tests',
          label: 'OC | Native Stable Session'
        },
        true
      )
    ).toBe('Manual label')
    expect(
      resolveUnifiedTabLabel(
        {
          customLabel: null,
          quickCommandLabel: 'Run build',
          generatedLabel: 'Fix flaky tests',
          label: 'OC | Native Stable Session'
        },
        true
      )
    ).toBe('Run build')
  })
})
