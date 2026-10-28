import { describe, expect, it } from 'vitest'
import { findOptionOccurrence } from './command-option-occurrence'
import { planCommitMessageGeneration } from './commit-message-plan'
import {
  openCodeTextOnlyStandaloneRetryPlan,
  openCodeVariantRetryPlan
} from './opencode-generation-command'
import {
  OPENCODE_TEXT_ONLY_AGENT_FILE,
  OPENCODE_TEXT_ONLY_AGENT_SOURCE
} from './opencode-text-only-agent'

const rejection = 'Unrecognized flag: --variant in command opencode run'
describe('OpenCode generation commands', () => {
  it.each(['opencode', 'opencode.exe', 'opencode.cmd', 'opencode2'])(
    'keeps run before launch flags for %s',
    (binary) => {
      const result = planCommitMessageGeneration(
        { agentId: 'opencode', model: 'default', agentCommandOverride: `${binary} --auto` },
        'PROMPT'
      )
      expect(result).toMatchObject({
        ok: true,
        plan: {
          args: ['run', '--auto', '--agent', 'orca-text-only', '--format', 'json'],
          stdinPayload: 'PROMPT',
          outputFormat: 'opencode-json'
        }
      })
    }
  )

  it.each(['opencode', 'opencode2'] as const)(
    'runs %s generation as the agent both the installed file and the fallback deny every tool',
    (agentId) => {
      const result = planCommitMessageGeneration({ agentId, model: 'default' }, 'PROMPT')
      if (!result.ok) {
        throw new Error(result.error)
      }
      const agent = findOptionOccurrence(result.plan.args, ['--agent'], true)?.value ?? ''
      expect(OPENCODE_TEXT_ONLY_AGENT_FILE).toBe(`${agent}.md`)
      expect(OPENCODE_TEXT_ONLY_AGENT_SOURCE).toMatch(/^permission:\n {2}"\*": deny\n---\n$/m)

      const retry = openCodeTextOnlyStandaloneRetryPlan(
        result.plan,
        `{"type":"error","error":{"message":"Agent not found: \\"${agent}\\""}}`
      )
      expect(retry?.args.slice(0, 2)).toEqual(['run', '--standalone'])
      expect(JSON.parse(retry?.env?.OPENCODE_CONFIG_CONTENT ?? '{}')).toMatchObject({
        agent: { [agent]: { permission: { '*': 'deny' } } }
      })
    }
  )

  it('retries on a private server only when the text-only agent itself is missing', () => {
    const result = planCommitMessageGeneration({ agentId: 'opencode2', model: 'default' }, 'P')
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(openCodeTextOnlyStandaloneRetryPlan(result.plan, 'provider rejected')).toBeNull()
    expect(openCodeTextOnlyStandaloneRetryPlan(result.plan, 'Agent not found: "plan"')).toBeNull()
  })

  it('keeps explicit formatted output recipes on their requested output format', () => {
    const result = planCommitMessageGeneration(
      { agentId: 'opencode', model: 'default', agentArgs: '--format default' },
      'PROMPT'
    )
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.plan.outputFormat).toBeUndefined()
  })

  it('retries only the precise v2 argv rejection, retaining the prompt and selected model', () => {
    const result = planCommitMessageGeneration(
      { agentId: 'opencode', model: 'fixture/chat', thinkingLevel: 'high' },
      'PROMPT'
    )
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(openCodeVariantRetryPlan(result.plan, rejection)).toMatchObject({
      args: [
        'run',
        '--model',
        'fixture/chat#high',
        '--agent',
        'orca-text-only',
        '--format',
        'json'
      ],
      stdinPayload: 'PROMPT'
    })
    expect(openCodeVariantRetryPlan(result.plan, 'provider rejected the request')).toBeNull()
    expect(openCodeVariantRetryPlan(result.plan, 'Unrecognized flag: --other')).toBeNull()
  })
  it.each([
    '--model=fixture/chat --variant=high',
    '-mfixture/chat --variant=high',
    '--variant high --model=fixture/chat',
    '--variant=high -m fixture/chat'
  ])('retries the chosen recipe model and variant in %s', (agentArgs) => {
    const result = planCommitMessageGeneration(
      { agentId: 'opencode', model: 'other/model', thinkingLevel: 'low', agentArgs },
      'PROMPT'
    )
    if (!result.ok) {
      throw new Error(result.error)
    }
    const retry = openCodeVariantRetryPlan(result.plan, rejection)
    expect(retry?.args.join(' ')).toContain('fixture/chat#high')
    expect(retry?.args.join(' ')).not.toContain('--variant')
    expect(retry?.stdinPayload).toBe('PROMPT')
  })

  it('does not treat prompt tokens after the terminator as options', () => {
    expect(
      openCodeVariantRetryPlan(
        {
          binary: 'opencode',
          label: 'OpenCode',
          stdinPayload: null,
          args: ['run', '--model=fixture/chat', '--', '--variant=high']
        },
        rejection
      )
    ).toBeNull()
    expect(
      openCodeVariantRetryPlan(
        {
          binary: 'opencode',
          label: 'OpenCode',
          stdinPayload: null,
          args: ['run', '--variant=high', '--', '--model=fixture/chat']
        },
        rejection
      )
    ).toBeNull()
  })
})
