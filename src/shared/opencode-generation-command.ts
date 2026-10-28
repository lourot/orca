import { findOptionOccurrence } from './command-option-occurrence'
import type { CommitMessagePlan } from './commit-message-plan'
import {
  OPENCODE_TEXT_ONLY_AGENT,
  OPENCODE_TEXT_ONLY_CONFIG_CONTENT
} from './opencode-text-only-agent'

/** Reruns on a private server that reads the text-only agent inline, when the background service lacks its file. */
export function openCodeTextOnlyStandaloneRetryPlan(
  plan: CommitMessagePlan,
  output: string
): CommitMessagePlan | null {
  const runIndex = plan.args.indexOf('run')
  // Why loose: --format json reports it inside a JSON string, so the quotes arrive escaped.
  const missing = output.includes('Agent not found') && output.includes(OPENCODE_TEXT_ONLY_AGENT)
  if (runIndex === -1 || !missing) {
    return null
  }
  return {
    ...plan,
    args: [...plan.args.slice(0, runIndex + 1), '--standalone', ...plan.args.slice(runIndex + 1)],
    // Why: plain `opencode run` joins the shared background service, which never sees this env.
    env: { OPENCODE_CONFIG_CONTENT: OPENCODE_TEXT_ONLY_CONFIG_CONTENT, ...plan.env }
  }
}

export function mergeOpenCodeGenerationArgs(
  agentId: string,
  binary: string,
  prefixArgs: string[],
  args: string[]
): string[] {
  if (
    (agentId === 'opencode' || agentId === 'opencode2') &&
    /(?:^|[\\/])opencode2?(?:\.(?:cmd|exe))?$/i.test(binary) &&
    args[0] === 'run' &&
    !prefixArgs.includes('--')
  ) {
    return ['run', ...prefixArgs, ...args.slice(1)]
  }
  return [...prefixArgs, ...args]
}

export function openCodeVariantRetryPlan(
  plan: CommitMessagePlan,
  stderr: string
): CommitMessagePlan | null {
  // Retry only an argv rejection, which happens before a model turn starts.
  if (!stderr.includes('Unrecognized flag: --variant in command opencode run')) {
    return null
  }
  const variant = findOptionOccurrence(plan.args, ['--variant'], true)
  const model = findOptionOccurrence(plan.args, ['--model', '-m'], true)
  if (!variant?.value || !model?.value) {
    return null
  }
  const args = [...plan.args]
  const replacement = `${model.value.split('#')[0]}#${variant.value}`
  if (model.consumed === 2) {
    args[model.index + 1] = replacement
  } else {
    const token = args[model.index]
    args[model.index] = `${token.slice(0, token.length - model.value.length)}${replacement}`
  }
  args.splice(variant.index, variant.consumed)
  return { ...plan, args }
}
